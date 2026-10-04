import { CodeMirrorBlock } from '@milkdown/kit/component/code-block';
import {
  codeLanguagePickerStore,
  selectedCodeLanguage,
} from './markdown-code-language-store';

type LanguageFocusRequest = {
  view: CodeMirrorBlock['view'];
  position: number;
  language: string;
  focused: Element | null;
};
const languageFocusRequests = new WeakMap<HTMLElement, LanguageFocusRequest>();

function restoreLanguageFocus(
  root: HTMLElement,
  request: LanguageFocusRequest,
  target: HTMLElement,
) {
  if (languageFocusRequests.get(root) !== request) return;
  languageFocusRequests.delete(root);
  if (request.view.isDestroyed || !target.isConnected) return;
  const current = request.view.state.doc.nodeAt(request.position);
  if (
    current?.type.name !== 'code_block' ||
    String(current.attrs.language ?? '') !== request.language
  )
    return;
  const liveDOM = request.view.nodeDOM(request.position);
  if (!(liveDOM instanceof HTMLElement) || !liveDOM.contains(target)) return;
  const active = target.ownerDocument.activeElement;
  if (
    active &&
    active !== target.ownerDocument.body &&
    active !== request.view.dom &&
    active !== request.focused &&
    !liveDOM.contains(active)
  )
    return;
  target.focus({ preventScroll: true });
}

/** Replace only Crepe's language UI, retaining its CodeMirror and node updates. */
export function presentCodeLanguagePicker(
  inner: CodeMirrorBlock,
  root: HTMLElement,
) {
  if (String(inner.node.attrs.language ?? '').toLowerCase() === 'latex')
    return inner;
  const dom = inner.dom;
  const host = dom.ownerDocument.createElement('div');
  host.id = `madoc-code-language-${crypto.randomUUID()}`;
  host.className = 'madoc-code-language-host';
  host.contentEditable = 'false';
  dom.dataset.madocLanguagePicker = 'true';
  const store = codeLanguagePickerStore(root);
  const languages = inner.getAllLanguages();
  const requestedFocus = languageFocusRequests.get(root);
  const restoreFocus = (target: HTMLButtonElement) => {
    if (requestedFocus?.view === inner.view && !target.disabled)
      restoreLanguageFocus(root, requestedFocus, target);
  };
  const setLanguage = (language: string) => {
    const position = inner.getPos();
    if (
      !inner.view.editable ||
      position === undefined ||
      inner.view.state.doc.nodeAt(position)?.type !== inner.node.type
    )
      return;
    const request = {
      view: inner.view,
      position,
      language,
      focused: dom.ownerDocument.activeElement,
    };
    languageFocusRequests.set(root, request);
    inner.setLanguage(language);
    const next = inner.view.nodeDOM(position);
    if (next === dom) languageFocusRequests.delete(root);
    else if (
      next instanceof HTMLElement &&
      next.classList.contains('madoc-block-math')
    )
      restoreLanguageFocus(root, request, next);
  };
  const publish = () => {
    if (!dom.isConnected || !dom.contains(host)) return;
    store.put({
      host,
      languages,
      setLanguage,
      restoreFocus,
      language: String(inner.node.attrs.language ?? ''),
      editable: inner.view.editable,
    });
  };
  const mount = () => {
    // Crepe creates and tears down its Vue UI as blocks enter/leave the viewport.
    // Publish a portal only after Vue has mounted .tools. A host placed in the
    // placeholder would be removed by app.mount(), dropping keyboard focus.
    const tools = dom.querySelector<HTMLElement>(':scope > .tools');
    if (!tools) {
      store.remove(host);
      return;
    }
    dom
      .querySelectorAll('.tools > .language-button, .tools > .language-picker')
      .forEach((element) => element.remove());
    if (host.parentElement !== tools) tools.append(host);
  };
  const observer = new MutationObserver(() => {
    mount();
    publish();
  });
  observer.observe(dom, { childList: true, subtree: true });
  observer.observe(inner.view.dom, {
    attributes: true,
    attributeFilter: ['contenteditable'],
  });
  mount();
  publish();
  const update = inner.update.bind(inner);
  inner.update = (next) => {
    const language = String(next.attrs.language ?? '');
    // Crepe only replaces syntax extensions when a loader returns a language.
    // Recreate an unsupported/plain-text view so the old highlighting is cleared.
    if (
      language !== String(inner.node.attrs.language ?? '') &&
      !selectedCodeLanguage(language, languages)
    )
      return false;
    const accepted = update(next);
    if (accepted) publish();
    return accepted;
  };
  const destroy = inner.destroy.bind(inner);
  inner.destroy = () => {
    observer.disconnect();
    store.remove(host);
    destroy();
  };
  return inner;
}
