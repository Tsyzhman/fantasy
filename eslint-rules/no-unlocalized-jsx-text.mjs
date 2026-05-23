const localizedComponents = new Set([
  "I18nText",
  "LocalizedOption",
  "LocalizedNumberInput"
]);

const visibleStringAttributes = new Set([
  "aria-label",
  "alt",
  "label",
  "placeholder",
  "title"
]);

const translatedAttributes = new Set(["en", "ru", "placeholderEn", "placeholderRu"]);

const allowedExactText = new Set([
  "Admin",
  "Active filters",
  "Baltika",
  "Fantasy Scout",
  "FotMob",
  "Machete",
  "MiXerr",
  "MiXerr / FotMob",
  "Sports.ru",
  "Wyscout"
]);

const noUnlocalizedJsxText = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn on visible JSX strings that are not wrapped in the localization helpers."
    },
    schema: [
      {
        type: "object",
        properties: {
          minLength: { type: "number" }
        },
        additionalProperties: false
      }
    ],
    messages: {
      unlocalizedText: "Visible text should use I18nText/localizedText or an explicit localized helper."
    }
  },
  create(context) {
    const minLength = context.options[0]?.minLength ?? 12;

    return {
      JSXText(node) {
        const text = normalizeText(node.value);
        if (!shouldReport(text, minLength) || isInsideLocalizedComponent(node)) return;
        context.report({ node, messageId: "unlocalizedText" });
      },
      JSXAttribute(node) {
        const attributeName = jsxName(node.name);
        if (!visibleStringAttributes.has(attributeName) || translatedAttributes.has(attributeName)) return;
        if (!node.value || node.value.type !== "Literal" || typeof node.value.value !== "string") return;

        const text = normalizeText(node.value.value);
        if (!shouldReport(text, minLength) || isInsideLocalizedComponent(node)) return;
        context.report({ node, messageId: "unlocalizedText" });
      }
    };
  }
};

export default noUnlocalizedJsxText;

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function shouldReport(text, minLength) {
  if (text.length < minLength) return false;
  if (!/[A-Za-zА-Яа-яЁё]/.test(text)) return false;
  if (allowedExactText.has(text)) return false;
  if (/^[A-ZА-ЯЁ0-9 ./+:()%-]+$/.test(text)) return false;
  if (/^[$/.[\]\w-]+$/.test(text)) return false;
  return true;
}

function isInsideLocalizedComponent(node) {
  let current = node.parent;
  while (current) {
    if (current.type === "JSXElement") {
      const componentName = jsxName(current.openingElement.name);
      if (localizedComponents.has(componentName)) return true;
    }
    current = current.parent;
  }
  return false;
}

function jsxName(node) {
  if (!node) return "";
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXNamespacedName") return `${node.namespace.name}:${node.name.name}`;
  if (node.type === "JSXMemberExpression") return jsxName(node.object);
  return "";
}
