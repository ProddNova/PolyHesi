import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const BOX_EDGES = new THREE.EdgesGeometry(UNIT_BOX);
const MIN_DIMENSION = 0.01;

const CATEGORY_COLORS = {
  rail: 0xffb000,
  road: 0xffe56b,
  garage: 0xb968ff,
  service: 0x78e0c1,
  created: 0x78e0c1,
  hitbox: 0xff5f7d,
  default: 0x9ed8ff,
};

export class RemodelOverlay {
  constructor(scene, world, camera, domElement, onSelect = null) {
    this.scene = scene;
    this.world = world;
    this.camera = camera;
    this.domElement = domElement;
    this.onSelect = onSelect;
    this.visible = false;
    this.selectedId = null;
    this.hoveredId = null;
    this.targets = [];
    this.targetIndexById = new Map();
    this.syncingControl = false;
    this.beforeTransform = null;

    this.group = new THREE.Group();
    this.group.name = "RemodelOverlay";
    this.group.visible = false;
    this.overlayMesh = null;
    this.hoverOutline = new THREE.LineSegments(
      BOX_EDGES,
      new THREE.LineBasicMaterial({
        color: 0x78e0c1,
        transparent: true,
        opacity: 0.88,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.hoverOutline.name = "RemodelHoverOutline";
    this.hoverOutline.visible = false;
    this.hoverOutline.renderOrder = 1002;
    this.selectedOutline = new THREE.LineSegments(
      BOX_EDGES,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.96,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.selectedOutline.name = "RemodelSelectedOutline";
    this.selectedOutline.visible = false;
    this.selectedOutline.renderOrder = 1003;

    this.controlAnchor = new THREE.Object3D();
    this.controlAnchor.name = "RemodelTransformAnchor";
    this.controlAnchor.visible = false;
    this.group.add(this.controlAnchor);
    this.transformControls = new TransformControls(camera, domElement);
    this.transformControls.setMode("translate");
    this.transformControls.setSpace("world");
    this.transformControls.setSize(1.18);
    this.transformControls.translationSnap = null;
    this.transformControls.enabled = false;
    this.transformControls.addEventListener("objectChange", () => this.applyAnchorTransform());
    this.transformControls.addEventListener("mouseDown", () => {
      this.beforeTransform?.();
      this.transformControls.dragging = true;
    });
    this.transformControls.addEventListener("mouseUp", () => {
      this.transformControls.dragging = false;
    });
    this.scene.add(this.transformControls.getHelper());

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.tempMatrix = new THREE.Matrix4();
    this.tempPosition = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempEuler = new THREE.Euler();
    this.tempScale = new THREE.Vector3();
    this.tempColor = new THREE.Color();
    this.tempCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
    this.tempScreen = new THREE.Vector3();

    this.group.add(this.hoverOutline);
    this.group.add(this.selectedOutline);
    this.scene.add(this.group);
  }

  setVisible(visible) {
    const nextVisible = Boolean(visible);
    if (nextVisible && !this.overlayMesh) {
      this.rebuild();
    }

    this.visible = nextVisible;
    this.group.visible = nextVisible;
    this.transformControls.enabled = nextVisible && Boolean(this.selectedId);
    this.transformControls.getHelper().visible = nextVisible && Boolean(this.selectedId);
    if (!nextVisible) {
      this.clearHover();
      this.clearSelection();
    }
  }

  rebuild() {
    if (this.overlayMesh) {
      this.group.remove(this.overlayMesh);
      this.overlayMesh.material.dispose?.();
      this.overlayMesh = null;
    }

    this.targets = this.world.getRemodelTargets();
    this.targetIndexById.clear();

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    const mesh = new THREE.InstancedMesh(UNIT_BOX, material, Math.max(1, this.targets.length));
    mesh.name = "RemodelTargetOverlay";
    mesh.count = this.targets.length;
    mesh.renderOrder = 1001;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < this.targets.length; i += 1) {
      const target = this.targets[i];
      const state = this.world.getRemodelTargetState(target.id);
      this.targetIndexById.set(target.id, i);
      mesh.setMatrixAt(i, this.matrixFromState(state));
      mesh.setColorAt(i, this.colorForTarget(target));
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
    this.overlayMesh = mesh;
    this.group.add(mesh);
    this.group.add(this.hoverOutline);
    this.group.add(this.selectedOutline);
  }

  refresh(selectId = this.selectedId) {
    this.clearHover();
    this.transformControls.detach();
    this.transformControls.enabled = false;
    this.transformControls.getHelper().visible = false;
    this.selectedId = null;
    this.selectedOutline.visible = false;
    this.rebuild();
    if (selectId && this.world.getRemodelTarget(selectId)) {
      this.selectTarget(selectId);
    }
  }

  setSnap(enabled, size = 0) {
    const gridSize = Math.max(0.01, Number(size) || 0);
    this.transformControls.translationSnap = enabled ? gridSize : null;
  }

  updateHover(camera = this.camera, domElement = this.domElement) {
    if (!this.visible || !this.overlayMesh || this.overlayMesh.count <= 0) {
      this.clearHover();
      return null;
    }

    this.mouse.set(0, 0);
    this.raycaster.setFromCamera(this.mouse, camera);

    const hit = this.raycaster
      .intersectObject(this.overlayMesh, false)
      .find((entry) => Number.isInteger(entry.instanceId));

    if (!hit) {
      this.clearHover();
      return null;
    }

    const target = this.targets[hit.instanceId];
    const state = target ? this.world.getRemodelTargetState(target.id) : null;
    if (!target || !state) {
      this.clearHover();
      return null;
    }

    this.hoveredId = target.id;
    this.updateHoverOutline(state);
    return {
      target,
      state,
      point: hit.point,
      screen: this.getLabelScreenPosition(state, camera, domElement),
      selected: target.id === this.selectedId,
    };
  }

  pickHovered() {
    if (!this.hoveredId) {
      return false;
    }

    this.selectTarget(this.hoveredId);
    return true;
  }

  createBox(state) {
    const created = this.world.createRemodelBox(state);
    if (!created?.target) {
      return null;
    }

    this.refresh(created.target.id);
    return {
      target: this.world.getRemodelTarget(created.target.id),
      state: this.world.getRemodelTargetState(created.target.id),
    };
  }

  duplicateSelected(offset = { x: 1.2, y: 0, z: 1.2 }) {
    const state = this.selectedId ? this.world.getRemodelTargetState(this.selectedId) : null;
    if (!state) {
      return null;
    }

    return this.createBox({
      ...state,
      position: {
        x: state.position.x + offset.x,
        y: state.position.y + offset.y,
        z: state.position.z + offset.z,
      },
    });
  }

  deleteSelected() {
    if (!this.selectedId) {
      return null;
    }

    const deleted = this.world.deleteRemodelTarget(this.selectedId);
    this.clearSelection();
    this.refresh(null);
    return deleted;
  }

  pick(event, camera, domElement) {
    if (!this.visible || !this.overlayMesh || this.overlayMesh.count <= 0) {
      return false;
    }

    const rect = domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.mouse, camera);

    const hit = this.raycaster
      .intersectObject(this.overlayMesh, false)
      .find((entry) => Number.isInteger(entry.instanceId));

    if (!hit) {
      this.clearSelection();
      return false;
    }

    const target = this.targets[hit.instanceId];
    if (!target) {
      this.clearSelection();
      return false;
    }

    this.selectTarget(target.id);
    return true;
  }

  selectTarget(id) {
    const target = this.world.getRemodelTarget(id);
    const state = this.world.getRemodelTargetState(id);
    if (!target || !state) {
      this.clearSelection();
      return;
    }

    this.selectedId = id;
    this.updateSelectedOutline(state);
    this.updateControlAnchor(state);
    this.transformControls.attach(this.controlAnchor);
    this.transformControls.enabled = true;
    this.transformControls.getHelper().visible = this.visible;
    this.onSelect?.(target, state);
  }

  clearSelection() {
    if (!this.selectedId && !this.selectedOutline.visible) {
      return;
    }

    this.selectedId = null;
    this.selectedOutline.visible = false;
    this.transformControls.detach();
    this.transformControls.enabled = false;
    this.transformControls.getHelper().visible = false;
    this.onSelect?.(null, null);
  }

  applySelectedState(state) {
    if (!this.selectedId) {
      return null;
    }

    const applied = this.world.applyRemodelTargetState(this.selectedId, state);
    if (!applied) {
      return null;
    }

    this.updateOverlayTarget(this.selectedId, applied);
    this.updateSelectedOutline(applied);
    this.updateControlAnchor(applied);
    return applied;
  }

  resetSelected() {
    if (!this.selectedId) {
      return null;
    }

    const state = this.world.resetRemodelTarget(this.selectedId);
    if (!state) {
      return null;
    }

    this.updateOverlayTarget(this.selectedId, state);
    this.updateSelectedOutline(state);
    this.updateControlAnchor(state);
    return {
      target: this.world.getRemodelTarget(this.selectedId),
      state,
    };
  }

  updateOverlayTarget(id, state) {
    const index = this.targetIndexById.get(id);
    if (index === undefined || !this.overlayMesh) {
      return;
    }

    this.overlayMesh.setMatrixAt(index, this.matrixFromState(state));
    this.overlayMesh.instanceMatrix.needsUpdate = true;
    this.overlayMesh.computeBoundingSphere();
  }

  updateSelectedOutline(state) {
    this.selectedOutline.visible = true;
    this.selectedOutline.position.set(state.position.x, state.position.y, state.position.z);
    this.selectedOutline.rotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
    this.selectedOutline.scale.set(
      Math.max(MIN_DIMENSION, state.dimensions.x),
      Math.max(MIN_DIMENSION, state.dimensions.y),
      Math.max(MIN_DIMENSION, state.dimensions.z),
    );
  }

  updateHoverOutline(state) {
    this.hoverOutline.visible = true;
    this.hoverOutline.position.set(state.position.x, state.position.y, state.position.z);
    this.hoverOutline.rotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
    this.hoverOutline.scale.set(
      Math.max(MIN_DIMENSION, state.dimensions.x),
      Math.max(MIN_DIMENSION, state.dimensions.y),
      Math.max(MIN_DIMENSION, state.dimensions.z),
    );
  }

  clearHover() {
    this.hoveredId = null;
    this.hoverOutline.visible = false;
  }

  updateControlAnchor(state) {
    this.syncingControl = true;
    this.controlAnchor.position.set(state.position.x, state.position.y, state.position.z);
    this.controlAnchor.rotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
    this.controlAnchor.scale.set(1, 1, 1);
    this.controlAnchor.updateMatrixWorld(true);
    this.syncingControl = false;
  }

  applyAnchorTransform() {
    if (this.syncingControl || !this.selectedId) {
      return;
    }

    const current = this.world.getRemodelTargetState(this.selectedId);
    const target = this.world.getRemodelTarget(this.selectedId);
    if (!current || !target) {
      return;
    }

    const applied = this.world.applyRemodelTargetState(this.selectedId, {
      ...current,
      position: {
        x: this.controlAnchor.position.x,
        y: this.controlAnchor.position.y,
        z: this.controlAnchor.position.z,
      },
    });
    if (!applied) {
      return;
    }

    this.updateOverlayTarget(this.selectedId, applied);
    this.updateSelectedOutline(applied);
    this.onSelect?.(target, applied);
  }

  getLabelScreenPosition(state, camera, domElement) {
    const halfX = Math.max(MIN_DIMENSION, state.dimensions.x) * 0.5;
    const halfY = Math.max(MIN_DIMENSION, state.dimensions.y) * 0.5;
    const halfZ = Math.max(MIN_DIMENSION, state.dimensions.z) * 0.5;
    const quaternion = this.tempQuaternion.setFromEuler(
      this.tempEuler.set(state.rotation.x, state.rotation.y, state.rotation.z),
    );
    const position = this.tempPosition.set(state.position.x, state.position.y, state.position.z);
    const corners = this.tempCorners;
    let index = 0;
    for (const x of [-halfX, halfX]) {
      for (const y of [-halfY, halfY]) {
        for (const z of [-halfZ, halfZ]) {
          corners[index].set(x, y, z).applyQuaternion(quaternion).add(position);
          index += 1;
        }
      }
    }

    const rect = domElement.getBoundingClientRect();
    let maxX = -Infinity;
    let minY = Infinity;
    for (const corner of corners) {
      this.tempScreen.copy(corner).project(camera);
      maxX = Math.max(maxX, (this.tempScreen.x * 0.5 + 0.5) * rect.width + rect.left);
      minY = Math.min(minY, (-this.tempScreen.y * 0.5 + 0.5) * rect.height + rect.top);
    }

    return {
      x: THREE.MathUtils.clamp(maxX, 12, window.innerWidth - 24),
      y: THREE.MathUtils.clamp(minY, 18, window.innerHeight - 18),
    };
  }

  hasSelection() {
    return Boolean(this.selectedId);
  }

  getSelectedTarget() {
    return this.selectedId ? this.world.getRemodelTarget(this.selectedId) : null;
  }

  isTransformDragging() {
    return Boolean(this.transformControls?.dragging);
  }

  matrixFromState(state) {
    this.tempPosition.set(state.position.x, state.position.y, state.position.z);
    this.tempEuler.set(state.rotation.x, state.rotation.y, state.rotation.z);
    this.tempQuaternion.setFromEuler(this.tempEuler);
    this.tempScale.set(
      Math.max(MIN_DIMENSION, state.dimensions.x),
      Math.max(MIN_DIMENSION, state.dimensions.y),
      Math.max(MIN_DIMENSION, state.dimensions.z),
    );
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    return this.tempMatrix;
  }

  colorForTarget(target) {
    const color = CATEGORY_COLORS[target.category] ?? CATEGORY_COLORS.default;
    return this.tempColor.setHex(color);
  }
}
