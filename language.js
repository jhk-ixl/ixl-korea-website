(function () {
  'use strict';

  const DEFAULT_LANGUAGE = 'en';
  const SUPPORTED_LANGUAGES = ['en', 'ko'];
  const STORAGE_KEY = 'ixl-korea-language';
  let currentLanguage = DEFAULT_LANGUAGE;
  let currentDictionary = {};
  const cache = {};
  const originals = new WeakMap();
  let applying = false;

  function getNestedValue(object, key) {
    return key.split('.').reduce(function (value, part) {
      return value && Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined;
    }, object);
  }

  async function loadTranslations(language) {
    if (cache[language]) return cache[language];
    const response = await fetch('lang/' + language + '.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Language file could not be loaded: ' + language);
    cache[language] = await response.json();
    return cache[language];
  }

  function remember(node, kind, value) {
    let record = originals.get(node);
    if (!record) { record = {}; originals.set(node, record); }
    if (!(kind in record)) record[kind] = value;
    return record[kind];
  }

  function translateTextNode(node, language, dictionary) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    if (!node.parentElement || node.parentElement.closest('script, style')) return;
    if (node.parentElement.closest('[data-i18n], [data-i18n-html]')) return;
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const original = remember(node, 'text', raw);
    if (language === 'en') { node.nodeValue = original; return; }
    const source = original.trim();
    const normalizedSource = source.replace(/\s+/g, ' ').trim();
    let translated = dictionary.auto && dictionary.auto[source];
    if (typeof translated !== 'string' && dictionary.auto) {
      translated = dictionary.auto[normalizedSource];
    }
    if (typeof translated === 'string') {
      const leading = original.match(/^\s*/)[0];
      const trailing = original.match(/\s*$/)[0];
      node.nodeValue = leading + translated + trailing;
    }
  }

  function translateTree(root, language, dictionary) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) { translateTextNode(node, language, dictionary); });
  }

  function translateAttributes(language, dictionary) {
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(function (element) {
      const original = remember(element, 'placeholder', element.getAttribute('placeholder') || '');
      if (language === 'en') element.setAttribute('placeholder', original);
      else element.setAttribute('placeholder', (dictionary.placeholder && dictionary.placeholder[original]) || original);
    });
  }

  function applyTranslations(language, dictionary) {
    applying = true;
    document.documentElement.lang = language === 'ko' ? 'ko' : 'en';

    document.querySelectorAll('[data-i18n]').forEach(function (element) {
      const original = remember(element, 'i18nText', element.textContent);
      if (language === 'en') element.textContent = original;
      else {
        const value = getNestedValue(dictionary, element.dataset.i18n);
        if (typeof value === 'string') element.textContent = value;
      }
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (element) {
      const original = remember(element, 'i18nHtml', element.innerHTML);
      if (language === 'en') element.innerHTML = original;
      else {
        const value = getNestedValue(dictionary, element.dataset.i18nHtml);
        if (typeof value === 'string') element.innerHTML = value;
      }
    });

    translateTree(document.body, language, dictionary);
    translateAttributes(language, dictionary);

    document.querySelectorAll('[data-language]').forEach(function (button) {
      const active = button.dataset.language === language;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const title = getNestedValue(dictionary, 'meta.title');
    if (language !== 'en' && typeof title === 'string') document.title = title;

    currentLanguage = language;
    currentDictionary = dictionary;
    localStorage.setItem(STORAGE_KEY, language);
    applying = false;

    document.dispatchEvent(new CustomEvent('languagechange', { detail: { language: language, translations: dictionary } }));
  }

  async function setLanguage(language) {
    const nextLanguage = SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
    try { applyTranslations(nextLanguage, await loadTranslations(nextLanguage)); }
    catch (error) { console.error(error); }
  }

  function initialLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(saved) ? saved : DEFAULT_LANGUAGE;
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-language]').forEach(function (button) {
      button.addEventListener('click', function () { setLanguage(button.dataset.language); });
    });

    const observer = new MutationObserver(function (mutations) {
      if (applying || currentLanguage !== 'ko') return;
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, currentLanguage, currentDictionary);
          else if (node.nodeType === Node.ELEMENT_NODE) translateTree(node, currentLanguage, currentDictionary);
        });
      });
      translateAttributes(currentLanguage, currentDictionary);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setLanguage(initialLanguage());
  });

  window.IXLLanguage = {
    setLanguage: setLanguage,
    getLanguage: function () { return currentLanguage; },
    getTranslations: function () { return currentDictionary; },
    t: function (key, fallback) {
      const value = getNestedValue(currentDictionary, key);
      return typeof value === 'string' ? value : (fallback || key);
    }
  };
})();
