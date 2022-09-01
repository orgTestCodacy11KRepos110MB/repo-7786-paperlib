import Realm from "realm";
import path from "path";
import { existsSync, promises as fsPromise } from "fs";
import keytar from "keytar";
// @ts-ignore
import noInternet from "no-internet";

import { PaperEntitySchema } from "../../models/PaperEntity";
import {
  PaperFolderSchema,
  PaperTagSchema,
} from "../../models/PaperCategorizer";
import { FeedSchema } from "../../models/Feed";
import { FeedEntitySchema } from "../../models/FeedEntity";

import { migrate } from "./db-migration";
import { DBRepository } from "./db-repository";

export async function initRealm(this: DBRepository, reinit = false) {
  this.stateStore.viewState.processingQueueCount.value += 1;
  this.stateStore.logState.processLog.value = "Initialize database...";

  if (this._realm || reinit) {
    if (this._realm) {
      this._realm.close();
    }
    this._realm = null;
    this.app = null;
    this.cloudConfig = null;
    this.syncSession = null;
    this.localConfig = null;
    this.entitiesListenerInited = false;
    this.categorizersListenerInited = {
      PaperTag: false,
      PaperFolder: false,
    };
    this.feedsListenerInited = false;
    this.feedEntitiesListenerInited = false;
  }

  if (this._realm) {
    return this._realm;
  }

  await this.getConfig();
  if (this.cloudConfig) {
    try {
      this._realm = new Realm(this.cloudConfig);
      this.syncSession = this._realm.syncSession;
    } catch (err) {
      // @ts-ignore
      if (err.message.includes("Unexpected future history schema")) {
        if (existsSync(this.cloudConfig.path ? this.cloudConfig.path : "")) {
          await fsPromise.unlink(this.cloudConfig.path!);
          try {
            this._realm = new Realm(this.cloudConfig);
            this.syncSession = this._realm.syncSession;
          } catch (err) {
            console.log(err);
            this.stateStore.logState.alertLog.value = `Open cloud database faild: ${
              err as string
            }`;
          }
        }
      } else {
        this.stateStore.logState.alertLog.value = `Open cloud database faild: ${
          err as string
        }`;
      }
    }
  } else {
    try {
      this._realm = new Realm(this.localConfig as Realm.Configuration);
    } catch (err) {
      console.log(err);
      this.stateStore.logState.alertLog.value = `Open local database faild: ${
        err as string
      }`;
    }
  }

  this.stateStore.viewState.processingQueueCount.value -= 1;

  // @ts-ignore
  this._realm.safeWrite = (callback) => {
    if (this._realm?.isInTransaction) {
      callback();
    } else {
      this._realm?.write(callback);
    }
  };

  return this._realm;
}

export async function getConfig(
  this: DBRepository
): Promise<Realm.Configuration> {
  const syncPassword = await keytar.getPassword("paperlib", "realmSync");
  if (
    this.preference.get("useSync") &&
    this.preference.get("syncEmail") !== "" &&
    syncPassword
  ) {
    return await this.getCloudConfig();
  } else {
    this.cloudConfig = null;
    return await this.getLocalConfig();
  }
}

export async function getLocalConfig(
  this: DBRepository
): Promise<Realm.Configuration> {
  await this.logoutCloud();

  if (!existsSync(this.preference.get("appLibFolder") as string)) {
    await fsPromise.mkdir(this.preference.get("appLibFolder") as string, {
      recursive: true,
    });
  }

  const config = {
    schema: [
      PaperEntitySchema,
      PaperTagSchema,
      PaperFolderSchema,
      FeedSchema,
      FeedEntitySchema,
    ],
    schemaVersion: this._schemaVersion,
    path: path.join(
      this.preference.get("appLibFolder") as string,
      "default.realm"
    ),
    migration: migrate,
  };
  this.localConfig = config;
  return config;
}

export async function getCloudConfig(
  this: DBRepository
): Promise<Realm.Configuration> {
  const cloudUser = await this.loginCloud();

  if (cloudUser) {
    const config = {
      schema: [
        PaperEntitySchema,
        PaperTagSchema,
        PaperFolderSchema,
        FeedSchema,
        FeedEntitySchema,
      ],
      schemaVersion: this._schemaVersion,
      sync: {
        user: cloudUser,
        partitionValue: cloudUser.id,
      },
      path: path.join(
        this.stateStore.dbState.defaultPath.value,
        "synced.realm"
      ),
    };
    this.cloudConfig = config;
    return config;
  } else {
    this.preference.set("useSync", false);
    this.stateStore.viewState.preferenceUpdated.value = Date.now();
    return this.getLocalConfig();
  }
}

export async function loginCloud(
  this: DBRepository
): Promise<Realm.User | null> {
  if (!this.app) {
    process.chdir(this.stateStore.dbState.defaultPath.value);

    const id = this.preference.get("syncAPPID") as string;
    this.app = new Realm.App({
      id: id,
    });
  }

  if (await noInternet()) {
    console.log("No internet!");
    return this.app.currentUser;
  }

  try {
    const syncPassword = await keytar.getPassword("paperlib", "realmSync");
    const credentials = Realm.Credentials.emailPassword(
      this.preference.get("syncEmail") as string,
      syncPassword as string
    );

    const loginedUser = await this.app.logIn(credentials);

    this.stateStore.logState.processLog.value =
      "Successfully logged in! Data is syncing...";

    this.app.switchUser(loginedUser);
    return this.app.currentUser;
  } catch (error) {
    this.preference.set("useSync", false);
    this.stateStore.viewState.preferenceUpdated.value = Date.now();
    this.stateStore.logState.alertLog.value = `Login failed, ${
      error as string
    }`;

    return null;
  }
}

export async function logoutCloud(this: DBRepository) {
  if (this.app) {
    // @ts-ignore
    for (const [_, user] of Object.entries(this.app.allUsers)) {
      await this.app.removeUser(user);
    }
  }
  const syncDBPath = path.join(
    this.stateStore.dbState.defaultPath.value,
    "synced.realm"
  );

  if (existsSync(syncDBPath)) {
    await fsPromise.unlink(
      path.join(this.stateStore.dbState.defaultPath.value, "synced.realm")
    );
  }
}

export function pauseSync(this: DBRepository) {
  if (this.syncSession) {
    this.syncSession.pause();
  }
}

export function resumeSync(this: DBRepository) {
  if (this.syncSession) {
    this.syncSession.resume();
  }
}
