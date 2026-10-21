/** Form fields own their keys instead of moving the map or selecting battle units. */
export function typingTarget(element: Element | null) {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement)
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'image', 'color', 'file'].includes(
      element.type,
    );
  return element instanceof HTMLElement && element.isContentEditable;
}
