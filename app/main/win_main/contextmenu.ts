import { ipcMain, Menu, BrowserWindow, nativeImage } from "electron";

import { Preference, ScraperPreference } from "../../preference/preference";

const isMac = process.platform === "darwin";

const blueBuf = Buffer.from([246, 130, 59, 0]);
let blueIcon = nativeImage.createFromBuffer(blueBuf, { width: 1, height: 1 });
blueIcon = blueIcon.resize({ width: 3, height: 10 });

const redBuf = Buffer.from([68, 68, 239, 0]);
let redIcon = nativeImage.createFromBuffer(redBuf, { width: 1, height: 1 });
redIcon = redIcon.resize({ width: 3, height: 10 });

const yellowBuf = Buffer.from([8, 179, 234, 0]);
let yellowIcon = nativeImage.createFromBuffer(yellowBuf, {
  width: 1,
  height: 1,
});
yellowIcon = yellowIcon.resize({ width: 3, height: 10 });

const greenBuf = Buffer.from([94, 197, 34, 0]);
let greenIcon = nativeImage.createFromBuffer(greenBuf, { width: 1, height: 1 });
greenIcon = greenIcon.resize({ width: 3, height: 10 });

export function registerMainContextMenu(preference: Preference) {
  ipcMain.on("show-data-context-menu", (event, args) => {
    const scraperPrefs = preference.get("scrapers") as Array<ScraperPreference>;

    let scraperMenuTemplate: Record<string, any> = [];
    for (const scraperPref of scraperPrefs) {
      if (scraperPref.enable) {
        scraperMenuTemplate.push({
          label: scraperPref.name,
          click: () => {
            event.sender.send("data-context-menu-scrape-from", [
              scraperPref.name,
            ]);
          },
        });
      }
    }

    const template = [
      {
        label: "Open",
        accelerator: "Enter",
        click: () => {
          event.sender.send("data-context-menu-open");
        },
      },
      {
        label: isMac ? "Show in Finder" : "Show in Explorer",
        click: () => {
          event.sender.send("data-context-menu-showinfinder");
        },
      },
      { type: "separator" },
      {
        label: "Edit",
        enabled: args,
        accelerator: isMac ? "cmd+e" : "ctrl+e",
        click: () => {
          event.sender.send("data-context-menu-edit");
        },
      },
      {
        label: "Scrape",
        accelerator: isMac ? "cmd+r" : "ctrl+r",
        click: () => {
          event.sender.send("data-context-menu-scrape");
        },
      },

      {
        label: "Scrape from",
        submenu: scraperMenuTemplate,
      },

      {
        label: "Delete",
        click: () => {
          event.sender.send("data-context-menu-delete");
        },
      },
      {
        label: "Toggle Flag",
        accelerator: isMac ? "cmd+f" : "ctrl+f",
        click: () => {
          event.sender.send("data-context-menu-flag");
        },
      },
      { type: "separator" },
      {
        label: "Export",
        submenu: [
          {
            label: "BibTex",
            accelerator: isMac ? "cmd+shift+c" : "ctrl+shift+c",
            click: () => {
              event.sender.send("data-context-menu-export-bibtex");
            },
          },
          {
            label: "BibTex Key",
            accelerator: isMac ? "cmd+shift+k" : "ctrl+shift+k",
            click: () => {
              event.sender.send("data-context-menu-export-bibtex-key");
            },
          },
          {
            label: "Plain Text",
            click: () => {
              event.sender.send("data-context-menu-export-plain");
            },
          },
        ],
      },
    ];
    // @ts-ignore
    const menu = Menu.buildFromTemplate(template);
    // @ts-ignore
    menu.popup(BrowserWindow.fromWebContents(event.sender));
  });

  ipcMain.on("show-feed-data-context-menu", (event, args) => {
    const template = [
      {
        label: "Open",
        accelerator: "Enter",
        click: () => {
          event.sender.send("data-context-menu-open");
        },
      },
      { type: "separator" },
      {
        label: "Add to Library",
        click: () => {
          event.sender.send("feed-data-context-menu-add");
        },
      },
      {
        label: "Toggle Read / Unread",
        click: () => {
          event.sender.send("feed-data-context-menu-read");
        },
      },
    ];
    // @ts-ignore
    const menu = Menu.buildFromTemplate(template);
    // @ts-ignore
    menu.popup(BrowserWindow.fromWebContents(event.sender));
  });

  ipcMain.on("show-sidebar-context-menu", (event, args) => {
    const data = args.data;
    const type = args.type;
    const template = [
      {
        label: "Blue",
        click: () => {
          event.sender.send("sidebar-context-menu-color", [data, type, "blue"]);
        },
        icon: blueIcon,
      },
      {
        label: "Red",
        click: () => {
          event.sender.send("sidebar-context-menu-color", [data, type, "red"]);
        },
        icon: redIcon,
      },
      {
        label: "Yellow",
        click: () => {
          event.sender.send("sidebar-context-menu-color", [
            data,
            type,
            "yellow",
          ]);
        },
        icon: yellowIcon,
      },
      {
        label: "Green",
        click: () => {
          event.sender.send("sidebar-context-menu-color", [
            data,
            type,
            "green",
          ]);
        },
        icon: greenIcon,
      },
      { type: "separator" },
      {
        label: "Delete",
        click: () => {
          event.sender.send("sidebar-context-menu-delete", [data, type]);
        },
      },
    ];
    if (type === "feed") {
      template.push({
        label: "Refresh",
        click: () => {
          event.sender.send("sidebar-context-menu-feed-refresh", [data, type]);
        },
      });
    } else {
      template.push({
        label: "Edit",
        click: () => {
          event.sender.send("sidebar-context-menu-edit", [data, type]);
        },
      });
    }
    // @ts-ignore
    const menu = Menu.buildFromTemplate(template);
    // @ts-ignore
    menu.popup(BrowserWindow.fromWebContents(event.sender));
  });

  ipcMain.on("show-sup-context-menu", (event, args) => {
    const template = [
      {
        label: "Delete",
        click: () => {
          event.sender.send("sup-context-menu-delete", args);
        },
      },
    ];
    // @ts-ignore
    const menu = Menu.buildFromTemplate(template);
    // @ts-ignore
    menu.popup(BrowserWindow.fromWebContents(event.sender));
  });

  ipcMain.on("show-thumbnail-context-menu", (event, args) => {
    const template = [
      {
        label: "Replace",
        click: () => {
          event.sender.send("thumbnail-context-menu-replace", args);
        },
      },
    ];
    // @ts-ignore
    const menu = Menu.buildFromTemplate(template);
    // @ts-ignore
    menu.popup(BrowserWindow.fromWebContents(event.sender));
  });
}
