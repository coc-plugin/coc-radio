import dns from 'dns';
import util from 'util';
const resolveSrv = util.promisify(dns.resolveSrv);

export interface Station {
  id: string;
  label: string;
  changeuuid: string;
  stationuuid: string;
  serveruuid: string;
  name: string;
  url: string;
  url_resolved: string;
  homepage: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  iso_3166_2: string;
  state: string;
  language: string;
  languagecodes: string;
  votes: number;
  lastchangetime: string;
  lastchangetime_iso8601: string;
  codec: string;
  bitrate: number;
  hls: number;
  lastcheckok: number;
  lastchecktime: string;
  lastchecktime_iso8601: string;
  lastcheckoktime: string;
  lastcheckoktime_iso8601: string;
  lastlocalchecktime: string;
  lastlocalchecktime_iso8601: string;
  clicktimestamp: string;
  clicktimestamp_iso8601: string;
  clickcount: number;
  clicktrend: number;
  ssl_error: number;
  geo_lat: number | null;
  geo_long: number | null;
  geo_distance: number | null;
  has_extended_info: boolean;
  collected: number;
  status: 'load' | 'play' | 'paused';
}

interface Countrie {
  name: string;
  count: number;
  countrycode: string;
}

interface Tag {
  name: string;
  stationcount: number;
}

class AudioBase {
  base_url = '';
  async getBaseUrls() {
    return resolveSrv('_api._tcp.radio-browser.info').then((hosts) => {
      hosts.sort();
      return hosts.map((host) => 'https://' + host.name);
    });
  }
  async getBaseUrl() {
    const hosts = await this.getBaseUrls();
    this.base_url = hosts[Math.floor(Math.random() * hosts.length)];
  }
  async request(url: string, data: { [x: string]: string | number | boolean }): Promise<any> {
    if (!this.base_url) {
      await this.getBaseUrl();
    }
    let u = this.base_url + url;
    for (let key in data) {
      if (u.indexOf('?') > -1) {
        u += `&${key}=${encodeURIComponent(data[key])}`;
      } else {
        u += `?${key}=${encodeURIComponent(data[key])}`;
      }
    }
    const res = await fetch(u);
    return res.json();
  }
  //合并参数
  mergeOptions(defaultOptions: any, options: any) {
    return { ...defaultOptions, ...options };
  }
}

class Audio extends AudioBase {
  async getCountries(
    options: {
      order?: string;
      reverse?: boolean;
      hidebroken?: boolean;
      offset?: number;
      limit?: number;
    } = {}
  ): Promise<Countrie[]> {
    const data: any[] = await this.request(
      '/json/countries',
      this.mergeOptions(
        {
          order: 'name',
          reverse: true,
          hidebroken: true,
        },
        options
      )
    );
    return data.map((item) => {
      return {
        name: item.name,
        count: item.stationcount,
        countrycode: item.iso_3166_1,
      };
    });
  }
  async getTags(
    options: {
      order?: string;
      reverse?: boolean;
      hidebroken?: boolean;
      offset?: number;
      limit?: number;
    } = {}
  ): Promise<Tag[]> {
    return this.request(
      '/json/tags',
      this.mergeOptions(
        {
          order: 'name',
          reverse: true,
          hidebroken: true,
        },
        options
      )
    );
  }
  async getStations(
    options: {
      country?: string;
      order?: string;
      reverse?: boolean;
      hidebroken?: boolean;
      offset?: number;
      limit?: number;
    } = {}
  ): Promise<Station[]> {
    return this.request(
      '/json/stations/search',
      this.mergeOptions(
        {
          country: 'China',
          order: 'clickcount',
          reverse: true,
          hidebroken: true,
        },
        options
      )
    );
  }
}

export default Audio;
