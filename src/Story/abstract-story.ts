import SimpleEventEmitter from "@/utils/event-emitter";
import { makeRandomStorySecretKey, getBranchLink, makeViewKey, makeBranchQueryData, qrDataToDataUrl } from "@/utils/utils";
import { StoryOptions } from "@/Story/types";
import {
  fetchAvatarAndTitleGivenViewKey,
  fetchAvatarAndTitleGivenStoryId
} from "@/utils/utils";
import SocketIO from "socket.io-client";


export default abstract class AbstractStory {
  rootElement: HTMLElement;
  id: string;
  viewKey: string;
  secretKey?: string;

  protected _elems: {
    title: HTMLAnchorElement;
    description: HTMLElement;
    avatar: HTMLElement;
    avatarContainer: HTMLElement;
  };

  protected _listenerRemoveFunctions: Array<() => void> = [];

  protected _eventEmitter = new SimpleEventEmitter();
  on = this._eventEmitter.on.bind(this._eventEmitter);
  off = this._eventEmitter.off.bind(this._eventEmitter);
  protected _title: string;
  protected _description: string;
  protected _avatarSrc: string = "";
  protected _color: string;
  private socket: any;

  get avatarSrc(): string {
    return this._avatarSrc;
  }
  set avatarSrc(src: string) {
    this._avatarSrc = src;
    this._elems.avatar.style.backgroundImage = `url(${src})`;
  }

  abstract get title(): string;
  abstract set title(title: string);
  abstract get description(): string;
  abstract set description(description: string);
  abstract get color(): string;
  abstract set color(color: string);

  protected abstract _createTemplate(): HTMLElement;

  protected checkForVideoInStory() {
    const promise = fetchAvatarAndTitleGivenViewKey(this.viewKey);
    promise.then((data) => {
      this.avatarSrc = data.src;
      this.title = data.title;
    }).catch((err) => {
    });
  }

  private mediaDetected(media) {
    this.socket.disconnect();
    this.checkForVideoInStory();
  }

  private socketConnected() {
    this.socket.on('media', this.mediaDetected.bind(this));
    this.socket.emit('subscribe_to_story_media', {viewKey: this.viewKey});
  }

  protected setupSocketToListenForNewMediaInStory() {
    this.socket = SocketIO('https://live.gobiapp.com');
    this.socket.on('connect', this.socketConnected.bind(this));
  }

  protected async putQrInAvatar(storyName: string, secretKey: string) {
    const data = makeBranchQueryData(storyName, secretKey);
    const result: any = await getBranchLink(data);
    const qrData = result.url;
    this.title = qrData;
    const dataUrl: string = await qrDataToDataUrl(qrData);
    this.avatarSrc = dataUrl;
  }

  protected constructor(options: StoryOptions) {
    this.rootElement = this._createTemplate();
    this._elems = {
      title: <HTMLAnchorElement>this._getElem("title"),
      description: this._getElem("description"),
      avatar: this._getElem("avatar"),
      avatarContainer: this._getElem("avatarContainer")
    };
    this.id = options.id || '';
    this.viewKey = options.viewKey || '';
    this.secretKey = options.secretKey || '';
    this._title = options.title || "";
    this.avatarSrc = options.avatarSrc || "";
    if (this.id || this.viewKey) {
      if (!options.avatarSrc || !this._title) {
        let promise;
        if (this.viewKey) {
          promise = fetchAvatarAndTitleGivenViewKey(this.viewKey);
          promise.catch(error => {
            // story likely empty, assume it is empty
            // assume storyName is viewKey, not always true
            const storyName: string = this.viewKey;
            this.secretKey && this.putQrInAvatar(storyName, this.secretKey);
          });
          this.setupSocketToListenForNewMediaInStory();
        } else {
          promise = fetchAvatarAndTitleGivenStoryId(this.id);
        }
        promise.then(data => {
          this.avatarSrc = this.avatarSrc || data.src;
          this.title = this.title || data.title;
        });
      }
    } else {
      this.secretKey = makeRandomStorySecretKey();
      this.viewKey = makeViewKey(this.secretKey);
      const storyName = this.viewKey.slice(0, 20);
      this.putQrInAvatar(storyName, this.secretKey);
      // User now scans this QR with their phone, and adds a video
      this.setupSocketToListenForNewMediaInStory();
    }
    this._description = options.description || "";
    this._color = options.color || "";
    this._addSelectEmitter();
    if (typeof options.onSelect === "function") {
      this._eventEmitter.on("select", options.onSelect);
    }
    if (options.container) {
      options.container.appendChild(this.rootElement);
    }
  }

  destroy() {
    if (this.rootElement.parentElement) {
      this.rootElement.parentElement.removeChild(this.rootElement);
    }
    this._eventEmitter.off();
    for (let i = this._listenerRemoveFunctions.length; i--; ) {
      this._listenerRemoveFunctions[i]();
    }
  }

  private _addSelectEmitter() {
    const selectAreas = this.rootElement.querySelectorAll(
      "[data-select-area]"
    ) as NodeListOf<HTMLElement>;
    const selectClickCallback = () => {
      this._eventEmitter.emit("select", this);
    };
    for (let i = selectAreas.length; i--; ) {
      selectAreas[i].addEventListener("click", selectClickCallback);
      this._listenerRemoveFunctions.push(() =>
        selectAreas[i].removeEventListener("click", selectClickCallback)
      );
    }
  }

  protected _getElem(name: string): HTMLElement {
    const attr = `data-${name}`;
    const elem = this.rootElement.querySelector(`[${attr}]`) as HTMLElement;
    if (elem) {
      elem.removeAttribute(attr);
      return elem;
    } else {
      throw new Error("Story does not contain element with name:" + name);
    }
  }
}