import {
  BasicList,
  commands,
  ExtensionContext,
  ListContext,
  ListItem,
  StatusBarItem,
  window,
  workspace,
} from 'coc.nvim';
import AudioRequest, { Station } from './request';
import { writeFile, mkdir, readFile } from 'fs/promises';
import path from 'path';
import Mpv from 'node-mpv';
interface StationListItem extends ListItem {
  data: Station;
}
export default class Radio extends BasicList {
  public readonly name = 'radio';
  public readonly description = 'coc internet radio player';
  public readonly detail = 'display all radio in list, with an play action';
  public readonly defaultAction = 'play';
  public dbPath = '';
  public dbData: Station[] = [];
  public playerStatus: StatusBarItem | null = null;
  public player: any;
  public isRuning: boolean = false;
  constructor(context: ExtensionContext) {
    super();
    this.dbPath = path.join(context.storagePath, 'db.json');
    if (this.playerStatus) {
      this.playerStatus.dispose();
      this.playerStatus = null;
    }

    context.subscriptions.push(
      commands.registerCommand('radio.start', async () => {
        const player = new Mpv({
          verbose: true,
          audio_only: true,
          auto_restart: true,
        });
        this.player = player;
        this.isRuning = true;
        window.showInformationMessage('radio started');
        this.initRadioStatus();
        player.on('stopped', () => {
          this.initRadioStatus();
        });
        this.addAction(
          'test',
          async (item) => {
            if (item.data?.status === 'load') {
              await player.load(item.data?.url);
            }
            if (item?.data?.status === 'play') {
              await player.pause();
            }
            if (item?.data?.status === 'paused') {
              await player.resume();
            }
            this.updateRadioStatus(item as any);
            if (this.playerStatus) {
              this.playerStatus.text = `${this.truncateString(item.data?.name, 20)}`;
              this.playerStatus.show();
            }
          },
          {
            persist: true,
            tabPersist: true,
            reload: true,
            parallel: true,
          }
        );

        this.addAction('play', async (item) => {
          let status = 'load';
          if (item.data?.status === 'load') {
            await player.load(item.data?.url);
            status = 'play';
          }
          if (item?.data?.status === 'play') {
            await player.pause();
            status = 'pause';
          }
          if (item?.data?.status === 'paused') {
            await player.resume();
            status = 'play';
          }
          this.updateRadioStatus(item as any);
          if (this.playerStatus) {
            this.playerStatus.text =
              status !== 'pause' ? `${this.truncateString(item.data?.name, 20)}` : 'radioPause';
            this.playerStatus.show();
          }
        });

        this.addAction(
          'stop',
          async () => {
            if (!player) return;
            await player.stop();
            this.initRadioStatus();
            if (this.playerStatus) {
              this.playerStatus.hide();
            }
          },
          {
            persist: true,
            tabPersist: true,
            reload: true,
            parallel: true,
          }
        );

        this.addAction(
          'favorite',
          async (item) => {
            const config = workspace.getConfiguration();
            const collects = config.get('radio.favorites') as string[];
            let ids = [...collects];
            if (!collects.includes(item.data?.id)) {
              ids.push(item.data?.id);
            } else {
              ids = ids.filter((r) => !r.includes(item.data?.id));
            }
            await config.update('radio.favorites', ids, true);
          },
          {
            persist: true,
            tabPersist: true,
            reload: true,
            parallel: true,
          }
        );
      })
    );
    context.subscriptions.push(
      commands.registerCommand('radio.stop', async () => {
        if (this.player) {
          this.player?.stop();
          this.player = null;
        }
        if (this.playerStatus) {
          this.playerStatus.text = '';
          this.playerStatus.dispose();
          this.playerStatus.hide();
        }
        this.dbData = [];
        this.isRuning = false;
        window.showWarningMessage('radio stopped');
      })
    );
    context.subscriptions.push(
      commands.registerCommand('radio.updateDB', async () => {
        window.showWarningMessage('radio db update started ...');
        await this.updateDB();
      })
    );
  }
  public async ensureFileExists(filePath: string, content = '') {
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(filePath, content, { flag: 'wx' });
    } catch (err) {
      if ((err as any).code === 'EEXIST') {
      } else {
        throw err;
      }
    }
  }
  truncateString(str: string, maxLength: number) {
    if (typeof str !== 'string' || maxLength <= 3) {
      return str;
    }

    if (str.length <= maxLength) {
      return str;
    }

    return str.substring(0, maxLength - 3) + '...';
  }
  public initRadioStatus() {
    if (this.playerStatus) {
      this.playerStatus.text = '';
      this.playerStatus.dispose();
      this.playerStatus.hide();
    }
    this.playerStatus = window.createStatusBarItem(0, { progress: false });
    this.dbData =
      this.dbData.map((item) => {
        item.status = 'load';
        return item;
      }) || [];
  }
  public updateRadioStatus(item: StationListItem) {
    if (!this.playerStatus) return;
    this.dbData = this.dbData.map((t) => {
      const status = item.data.status;
      if (t.stationuuid === item.data.stationuuid) {
        if (status === 'load') {
          t.status = 'play';
        }
        if (status === 'play') {
          t.status = 'paused';
        }
        if (status === 'paused') {
          t.status = 'play';
        }
      } else {
        t.status = 'load';
      }
      return t;
    });
  }
  public async updateDB() {
    if (this.player) {
      this.player?.stop();
    }
    await this.ensureFileExists(this.dbPath);
    const config = workspace.getConfiguration();
    const country = config.get<string>('radio.country') || 'China';
    const audioRequest = new AudioRequest();
    const stations = await audioRequest.getStations({
      country,
    });
    this.dbData = stations;
    await writeFile(this.dbPath, JSON.stringify(stations));
    window.showInformationMessage('coc-radio db update completed');
    return stations;
  }

  public parseJson(str: string) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  public async loadItems(context: ListContext): Promise<ListItem[]> {
    if (!this.isRuning) {
      window.showErrorMessage('Please execute the `radio.start` command to start the radio first');
      return [];
    }
    const { args } = context;
    let query = '';
    if (args && args.length > 0) {
      for (const arg of args) {
        if (arg.startsWith('--')) {
          continue;
        }

        query = arg;
      }
    }

    const items: StationListItem[] = [];
    const exts = this.dbData.length
      ? this.dbData.map((r) => this.format(r))
      : await this.fetchAudios();
    for (const ext of exts) {
      if (query && query.length > 0) {
        if (ext.name.indexOf(query) < 0) continue;
      }
      items.push({
        label: ext.label,
        data: {
          ...ext,
          name: ext.name,
        },
      });
    }
    items.sort((a, b) => {
      return b.data.collected - a.data.collected;
    });

    return items;
  }

  async fetchAudios(): Promise<Station[]> {
    const statusItem = window.createStatusBarItem(0, { progress: true });
    statusItem.text = 'Loading...';
    statusItem.show();
    const buffer = await readFile(this.dbPath);
    const db = this.parseJson(buffer.toString());
    if (!db) {
      this.dbData = await this.updateDB();
    } else {
      this.dbData = db;
    }
    statusItem.hide();
    return Promise.resolve(this.dbData.map((item) => this.format(item)));
  }

  private format(body: Station): Station {
    const station: Station = { ...body };
    let isCollected = 0;
    let favorite = '';
    const config = workspace.getConfiguration();
    const favorites = config.get('radio.favorites') as string[];
    if (favorites.includes(station.stationuuid)) {
      isCollected = 1;
      favorite = '*';
    }
    const status = station.status || 'load';
    return {
      ...station,
      label: `[${status}]${favorite} ${station.name.replace(/\s/g, '-')}`,
      collected: isCollected,
      id: station.stationuuid,
      status,
    };
  }

  public doHighlight(): void {
    const { nvim } = this;
    nvim.pauseNotification();
    nvim.command('syntax match CocMarketplaceExtName /\\v%5v\\S+/', true);
    nvim.command('syntax match CocRadioLoadStatus /\\v^\\[(load)\\]\\*?/', true);
    nvim.command('syntax match CocRadioPlayStatus /\\v^\\[(play)\\]\\*?/', true);
    nvim.command('syntax match CocRadioPausedStatus /\\v^\\[(paused)\\]\\*?/', true);
    nvim.command('highlight default CocRadioLoadStatus guifg=#808080 guibg=NONE', true);
    nvim.command('highlight default CocRadioPlayStatus guifg=#00FF00 guibg=NONE', true);
    nvim.command('highlight default CocRadioPausedStatus guifg=#FF8000 guibg=NONE', true);
    nvim.resumeNotification().catch(() => {
      // noop
    });
  }
}
