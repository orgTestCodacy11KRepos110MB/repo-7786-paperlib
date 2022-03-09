import { FileRepository } from "../repositories/FileRepository";
import { DBRepository } from "../repositories/DBRepository";
import { WebRepository } from "../repositories/WebRepository";
import { Exporter } from "../repositories/exporters/exporter";
import { Preference } from "../utils/preference";
import { PaperEntityDraft } from "../models/PaperEntity";
import { clipboard } from "electron";
import moment from "moment";
import { ToadScheduler, SimpleIntervalJob, Task } from "toad-scheduler";
import path from "path";

import { ipcRenderer } from "electron";

export class Interactor {
    constructor(sharedState) {
        this.sharedState = sharedState;

        this.preference = new Preference();
        this.dbRepository = new DBRepository(this.preference, this.sharedState);
        this.fileRepository = new FileRepository(this.preference);
        this.webRepository = new WebRepository(this.preference);

        this.exporter = new Exporter(this.preference);
    }

    registerSignal(signal, callback) {
        ipcRenderer.on(signal, callback);
    }

    async load(search, flag, tag, folder, sortBy, sortOrder) {
        return await this.dbRepository.entities(
            search,
            flag,
            tag,
            folder,
            sortBy,
            sortOrder,
        );
    }

    async loadTags() {
        return await this.dbRepository.tags();
    }

    async loadFolders() {
        return await this.dbRepository.folders();
    }

    async add(urlList) {
        this.sharedState.set("viewState.processingQueueCount", this.sharedState.get("viewState.processingQueueCount") + urlList.length);
        try {
            // 1. Metadata scraping.
            let scrapingPromise = async (url) => {
                var entityDraft;
                try {

                    entityDraft = await this.fileRepository.read(url);
                    entityDraft = await this.webRepository.scrape(entityDraft);
                } catch (error) {
                    console.log(error);
                }
                return entityDraft;
            };
            var entityDrafts = await Promise.all(urlList.map((url) => scrapingPromise(url)));
            entityDrafts = entityDrafts.filter((entity) => entity != null);

            // 2. Database processing.
            let moveSuccesses = await Promise.all(entityDrafts.map((entityDraft) => this.fileRepository.move(entityDraft)));
            entityDrafts = entityDrafts.filter((entityDraft, index) => moveSuccesses[index]);
            let dbSuccesses = await this.dbRepository.update(entityDrafts);
            // find unsuccessful entities.
            let unsuccessfulEntityDrafts = entityDrafts.filter((entityDraft, index) => !dbSuccesses[index]);
            await Promise.all(unsuccessfulEntityDrafts.map((entityDraft) => this.fileRepository.remove(entityDraft)));
        } catch (error) {
            console.log(error);
        }
        this.sharedState.set("viewState.processingQueueCount", this.sharedState.get("viewState.processingQueueCount") - urlList.length);
    }

    async delete(ids) {
        try {
            let removeFileURLs = await this.dbRepository.delete(ids);
            await Promise.all(removeFileURLs.map((url) => this.fileRepository.removeFile(url)));
        } catch (error) {
            console.log(error);
        }
    }

    deleteSup(entity, url) {
        entity = JSON.parse(entity);
        entity = new PaperEntityDraft(entity);

        try {
            this.fileRepository.removeFile(path.basename(url));
            entity.supURLs = entity.supURLs.filter((supUrl) => supUrl !== path.basename(url));
            this.dbRepository.update([entity]);
        } catch (error) {
            console.log(error);
        }
    }

    deleteTag(tagName) {
        this.dbRepository.deleteTag(tagName);
    }

    deleteFolder(folderName) {
        this.dbRepository.deleteFolder(folderName);
    }

    async scrape(entities) {
        entities = JSON.parse(entities);
        entities = entities.map((entity) => new PaperEntityDraft(entity));

        this.sharedState.set("viewState.processingQueueCount", this.sharedState.get("viewState.processingQueueCount") + entities.length);
        let matchPromise = async (entityDraft) => {
            try {
                entityDraft = await this.webRepository.scrape(entityDraft);
            } catch (error) {
                console.log(error);
            }
            return entityDraft
        };

        let entityDrafts = await Promise.all(entities.map((entity) => matchPromise(entity)));
        await this.update(JSON.stringify(entityDrafts));
        this.sharedState.set("viewState.processingQueueCount", this.sharedState.get("viewState.processingQueueCount") - entities.length);
    }

    async update(entities) {
        entities = JSON.parse(entities);
        entities = entities.map((entity) => new PaperEntityDraft(entity));

        this.sharedState.set("viewState.processingQueueCount", this.sharedState.get("viewState.processingQueueCount") + entities.length);
        let updatePromise = async (entities) => {
            try {
                for (let entity of entities) {
                    await this.fileRepository.move(entity);
                }
            } catch (error) {
                console.log(error);
            }
            await this.dbRepository.update(entities);
        };

        await updatePromise(entities);
        this.sharedState.set("viewState.processingQueueCount", this.sharedState.get("viewState.processingQueueCount") - entities.length);
    }

    export(entities, format) {
        entities = JSON.parse(entities);
        entities = entities.map((entity) => new PaperEntityDraft(entity));

        let text = this.exporter.export(entities, format);
        clipboard.writeText(text);
    }

    async routineScrape() {
        let allowRoutineMatch = this.preference.get("allowRoutineMatch");
        if (allowRoutineMatch) {
            console.log("Routine scraping started.");
            this.preference.set("lastRematchTime", moment().unix());
            let entities = await this.dbRepository.preprintEntities();
            let entityDrafts = entities.map((entity) => new PaperEntityDraft(entity));
            this.scrape(JSON.stringify(entityDrafts));
        }
    }

    setRoutineTimer() {
        let rematchInterval = this.preference.get("rematchInterval");
        let lastRematchTime = this.preference.get("lastRematchTime");

        if (moment().unix() - lastRematchTime > 86400 * rematchInterval) {
            this.routineScrape();
        }

        if (this.scheduler == null) {
            this.scheduler = new ToadScheduler();
        } else {
            this.scheduler.stop();
            this.scheduler.removeById("routineScrape");
        }

        const task = new Task("routineScrape", () => {
            this.routineScrape();
        });

        const job = new SimpleIntervalJob(
            { seconds: 86400 * rematchInterval, runImmediately: false },
            task,
            "routineScrape"
        );

        this.scheduler.addSimpleIntervalJob(job);
    }

    // Preference
    loadPreferences() {
        return this.preference.store.store;
    }

    updatePreference(name, value) {
        this.preference.set(name, value);
        this.sharedState.set("viewState.preferenceUpdated", new Date().getTime());
    }

    appLibPath() {
        return this.preference.get("appLibFolder");
    }

    async openLib() {
        await this.dbRepository.initRealm(true);
        this.sharedState.set("viewState.realmReinited", new Date().getTime());
    }

    migrateLocaltoSync() {
        this.dbRepository.migrateLocaltoSync();
    }
}
