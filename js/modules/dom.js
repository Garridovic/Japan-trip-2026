// Tiny DOM helpers. All dynamic text goes through textContent, never innerHTML.

export const byId = (id) => document.getElementById(id);

export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else element.setAttribute(key, value === true ? '' : value);
  }
  append(element, children);
  return element;
}

export function append(element, children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

export const externalLink = (href, text, className, extra = {}) =>
  h('a', { href, target: '_blank', rel: 'noopener', class: className, ...extra }, text);

export const setPressed = (buttons, isPressed) =>
  buttons.forEach((button) => button.setAttribute('aria-pressed', String(isPressed(button))));
