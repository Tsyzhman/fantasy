import { UnofficialFotMobClient } from "./client";
import { getFotMobBrowser, registerBrowserShutdownHooks } from "./browser-manager";

export class BrowserFotMobClient extends UnofficialFotMobClient {
  constructor() {
    super();
    registerBrowserShutdownHooks();
  }

  protected async getJson(
    path: string,
    params: Record<string, string | number | undefined>
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return getFotMobBrowser().fetchJson(url.toString());
  }

  protected async getText(url: string): Promise<string> {
    return getFotMobBrowser().fetchText(url);
  }
}
