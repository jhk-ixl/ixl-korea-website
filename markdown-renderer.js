(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch];
    });
  }

  function inlineMarkdown(text) {
    let s = escapeHtml(text);

    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');

    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    return s;
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown || '')
      .replace(/\r/g, '')
      .split('\n');

    let html = '';
    let listType = '';

    function closeList() {
      if (!listType) return;

      html += listType === 'ol'
        ? '</ol>'
        : '</ul>';

      listType = '';
    }

    function openList(type) {
      if (listType === type) return;

      closeList();

      html += type === 'ol'
        ? '<ol>'
        : '<ul>';

      listType = type;
    }

    for (const raw of lines) {
      let line = raw.trim();

      /*
       * Decap Rich Text may preserve Markdown markers
       * with a leading backslash.
       */
      line = line.replace(
        /^\\(?=(?:#{2,4}\s+|[-*]\s+|\d+\.\s+|>\s?|---+$))/,
        ''
      );

      if (!line) {
        closeList();
        continue;
      }

      const heading =
        line.match(/^(#{2,4})\s+(.+)$/);

      if (heading) {
        closeList();

        const level =
          Math.min(heading[1].length, 4);

        html +=
          `<h${level}>` +
          inlineMarkdown(heading[2]) +
          `</h${level}>`;

        continue;
      }

      if (/^---+$/.test(line)) {
        closeList();
        html += '<hr>';
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        openList('ul');

        html +=
          '<li>' +
          inlineMarkdown(
            line.replace(/^[-*]\s+/, '')
          ) +
          '</li>';

        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        openList('ol');

        html +=
          '<li>' +
          inlineMarkdown(
            line.replace(/^\d+\.\s+/, '')
          ) +
          '</li>';

        continue;
      }

      if (/^>\s?/.test(line)) {
        closeList();

        html +=
          '<blockquote>' +
          inlineMarkdown(
            line.replace(/^>\s?/, '')
          ) +
          '</blockquote>';

        continue;
      }

      closeList();

      html +=
        '<p>' +
        inlineMarkdown(line) +
        '</p>';
    }

    closeList();

    return html;
  }

  global.IXLMarkdown = Object.freeze({
    escapeHtml: escapeHtml,
    inlineMarkdown: inlineMarkdown,
    render: markdownToHtml
  });

})(window);