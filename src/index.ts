import { ExtensionContext, listManager } from 'coc.nvim';
import Radio from './radio';

export async function activate(context: ExtensionContext): Promise<void> {
  const { subscriptions } = context;
  subscriptions.push(listManager.registerList(new Radio(context)));
}
