import got from "got";

import { ScraperType } from "./scrapers/scraper";
import { PDFScraper } from "./scrapers/pdf";
import { DOIScraper } from "./scrapers/doi";
import { ArXivScraper } from "./scrapers/arxiv";
import {
  DBLPbyTimeScraper,
  DBLPScraper,
  DBLPVenueScraper,
} from "./scrapers/dblp";
import { IEEEScraper } from "./scrapers/ieee";
import { CVFScraper } from "./scrapers/cvf";
import { PwCScraper } from "./scrapers/paperwithcode";
import { OpenreviewScraper } from "./scrapers/openreview";
import { GoogleScholarScraper } from "./scrapers/google-scholar";
import { CustomScraper } from "./scrapers/custom";

import { Preference, ScraperPreference } from "../../utils/preference";
import { PaperEntityDraft } from "../../models/PaperEntityDraft";
import { PreloadStateStore } from "../../../state/appstate";

export class ScraperRepository {
  stateStore: PreloadStateStore;
  preference: Preference;

  scraperList: Array<{ name: string; scraper: ScraperType }>;

  constructor(stateStore: PreloadStateStore, preference: Preference) {
    this.stateStore = stateStore;
    this.preference = preference;

    this.scraperList = [];

    this.createScrapers();

    void got("https://paperlib.app/api/version");
  }

  async createScrapers() {
    this.scraperList = [];

    const scraperPrefs = (
      this.preference.get("scrapers") as Array<ScraperPreference>
    ).sort((a, b) => b.priority - a.priority);

    for (const scraper of scraperPrefs) {
      if (scraper.name === "dblp") {
        const dblpScraper = new DBLPScraper(this.stateStore, this.preference);
        const dblpByTimeScraper0 = new DBLPbyTimeScraper(
          this.stateStore,
          this.preference,
          0
        );
        const dblpbyTimeScraper1 = new DBLPbyTimeScraper(
          this.stateStore,
          this.preference,
          1
        );
        const dblpVenueScraper = new DBLPVenueScraper(
          this.stateStore,
          this.preference
        );
        this.scraperList.push({
          name: "dblp",
          scraper: dblpScraper,
        });
        this.scraperList.push({
          name: "dblp-by-time-0",
          scraper: dblpByTimeScraper0,
        });
        this.scraperList.push({
          name: "dblp-by-time-1",
          scraper: dblpbyTimeScraper1,
        });
        this.scraperList.push({
          name: "dblp-venue",
          scraper: dblpVenueScraper,
        });
      } else {
        let scraperInstance: ScraperType | undefined;
        switch (scraper.name) {
          case "pdf":
            scraperInstance = new PDFScraper(this.stateStore, this.preference);
            break;
          case "doi":
            scraperInstance = new DOIScraper(this.stateStore, this.preference);
            break;
          case "arxiv":
            scraperInstance = new ArXivScraper(
              this.stateStore,
              this.preference
            );
            break;
          case "ieee":
            scraperInstance = new IEEEScraper(this.stateStore, this.preference);
            break;
          case "cvf":
            scraperInstance = new CVFScraper(this.stateStore, this.preference);
            break;
          case "pwc":
            scraperInstance = new PwCScraper(this.stateStore, this.preference);
            break;
          case "openreview":
            scraperInstance = new OpenreviewScraper(
              this.stateStore,
              this.preference
            );
            break;
          case "googlescholar":
            scraperInstance = new GoogleScholarScraper(
              this.stateStore,
              this.preference
            );
            break;
          default:
            scraperInstance = new CustomScraper(
              this.stateStore,
              this.preference,
              scraper.name
            );
        }
        if (scraperInstance !== undefined) {
          this.scraperList.push({
            name: scraper.name,
            scraper: scraperInstance,
          });
        }
      }
    }
  }

  async scrape(
    entityDraft: PaperEntityDraft,
    excludes: string[] = []
  ): Promise<PaperEntityDraft> {
    for (const scraper of this.scraperList) {
      if (excludes.includes(scraper.name)) {
        continue;
      }
      try {
        entityDraft = await scraper.scraper.scrape(entityDraft);
      } catch (error) {
        console.log(error);
        this.stateStore.logState.alertLog.value = `${scraper.name} error: ${
          error as string
        }`;
      }
    }
    return entityDraft;
  }

  async scrapeFrom(
    entityDraft: PaperEntityDraft,
    scraperName: string
  ): Promise<PaperEntityDraft> {
    for (const scraper of this.scraperList) {
      if (scraper.name === scraperName) {
        try {
          entityDraft = await scraper.scraper.scrape(entityDraft);
        } catch (error) {
          console.log(error);
          this.stateStore.logState.alertLog.value = `${scraper.name} error: ${
            error as string
          }`;
        }
      }
    }
    return entityDraft;
  }
}
