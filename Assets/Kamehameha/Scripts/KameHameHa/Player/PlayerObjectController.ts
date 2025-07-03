import { SyncEntity } from "SpectaclesSyncKit.lspkg/Core/SyncEntity";
import { StorageProperty } from "SpectaclesSyncKit.lspkg/Core/StorageProperty";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { PlayerObjectManager } from "./PlayerObjectManager";

@component
export class PlayerObjectController extends BaseScriptComponent {
  @input
  playerObjectManager: PlayerObjectManager;

  private syncEntity: SyncEntity;
  private cameraTransform: Transform =
    WorldCameraFinderProvider.getInstance().getTransform();
  private transform: Transform = this.sceneObject.getTransform();
  private previousPos: vec3 = new vec3(0, 0, 0);
  private up = new vec3(0, 1, 0);

  onUpdate() {
    // tether object 
    // Update the player object pose for the local player here, gets synced via SyncTransform
    const forward = this.cameraTransform.forward.mult(new vec3(1, 0, 1));
    const newPos = this.cameraTransform
      .getWorldPosition()
      .add(forward.uniformScale(-50));
    const updatePos = vec3.lerp(this.previousPos, newPos, getDeltaTime() * 5);
    this.transform.setWorldPosition(updatePos);
    this.previousPos = updatePos;
  }

  onStart() {
    // Get the SyncEntity from the SyncTransform that's already on the scene object
    this.syncEntity = SyncEntity.getSyncEntityOnSceneObject(this.sceneObject);

    this.sceneObject.getChild(0).enabled = true;
    //this.syncEntity.addStorageProperty(this.somethingHappenedProp);

    this.syncEntity.notifyOnReady(() => {
      if (this.syncEntity.networkRoot.locallyCreated) {
        // Set start position
        const forward = this.cameraTransform.forward.mult(new vec3(1, 0, 1));
        this.previousPos = this.cameraTransform
          .getWorldPosition()
          .add(forward.uniformScale(-50));
        this.transform.setWorldPosition(this.previousPos);

        // Enable the player object content and subscribe to PlayerObjectManager
        this.sceneObject.name = this.sceneObject.name + " (Local Player)";
        this.sceneObject.getChild(0).enabled = true;
        this.playerObjectManager.subscribe(this);
      } else {
        this.sceneObject.name = this.sceneObject.name + " (Remote Player)";
      }
    });
  }

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }
}
