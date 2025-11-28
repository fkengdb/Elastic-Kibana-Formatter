// ==UserScript==
// @name         Elastic/Kibana JSON/XML Formatter
// @namespace    kibana/elastic-formatter
// @version      2.0
// @description  Formata JSON/XML no Kibana Discover e Kibana — detecta automaticamente /app/kibana ou /app/discover
// @match        *://*/app/kibana*
// @match        *://*/app/discover*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // -------- Utils --------
    function htmlDecode(str) {
        const txt = document.createElement("textarea");
        txt.innerHTML = str;
        return txt.value;
    }

    function tryParseJSON(text) {
        if (typeof text !== 'string') return { ok: false };

        let s = text.trim();

        try {
            const p = JSON.parse(s);
            if (p && (typeof p === 'object' || Array.isArray(p))) return { ok: true, value: p };
        } catch { }

        if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") {
            s = s.slice(1, -1).replace(/\\'/g, "'");
            try {
                const p = JSON.parse(s);
                if (p && (typeof p === 'object' || Array.isArray(p))) return { ok: true, value: p };
            } catch { }
        }

        if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
            try {
                const unq = JSON.parse(s);
                if (typeof unq === 'string') {
                    try {
                        const p = JSON.parse(unq);
                        if (p && (typeof p === 'object' || Array.isArray(p))) return { ok: true, value: p };
                    } catch { }
                } else if (unq && typeof unq === 'object') {
                    return { ok: true, value: unq };
                }
            } catch { }
        }

        if (s.startsWith('{') || s.startsWith('[')) {
            try {
                const p = JSON.parse(s);
                if (p && (typeof p === 'object' || Array.isArray(p))) return { ok: true, value: p };
            } catch { }
        }

        return { ok: false };
    }

    function isXML(text) {
        if (typeof text !== 'string') return false;
        const t = text.trim();
        return t.startsWith("<") && t.endsWith(">") && (t.includes("</") || t.includes("/>"));
    }

    function formatXML(xml) {
        xml = xml.replace(/(\s+[a-zA-Z0-9:_-]+=)([^\s">]+)/g, '$1"$2"');
        xml = xml.replace(/>\s*</g, '>\n<');

        let formatted = "";
        let pad = 0;

        xml.split("\n").forEach(node => {
            node = node.trim();
            if (!node) return;
            let indent = 0;

            if (node.match(/^<\/\w/)) pad = Math.max(pad - 2, 0);
            else if (node.match(/^<\w([^>]*[^\/])?>$/)) indent = 2;

            formatted += " ".repeat(pad) + node + "\n";
            pad += indent;
        });

        return formatted.trim();
    }

    function formatJSONValue(obj) {
        try { return JSON.stringify(obj, null, 2); }
        catch { return null; }
    }

    // -------- Campos --------
    const fields = [
        "message_in",
        "logicalResponsePayload",
        "responsePayloadReturn",
        "providerMsgReceived",
        "requestHeaderReceived",
        "requestPayloadReceived"
    ];

    // -------- PROCESSAMENTO --------
    function processField(field) {
        const selectors = [
            `tr[data-test-subj="tableDocViewRow-${field}"] .kbnDocViewer__value`,
            `tr[data-test-subj="tableDocViewRow-${field}"] .doc-viewer-value span[ng-non-bindable]`
        ];

        selectors.forEach(sel => {
            const containers = document.querySelectorAll(sel);

            containers.forEach(container => {
                if (container.dataset.formatted === "1") return;

                let raw = container.innerText || container.textContent || "";
                if (!raw.trim()) return;

                let decoded = htmlDecode(raw).trim();

                if (decoded.length >= 2 && decoded[0] === "'" && decoded[decoded.length - 1] === "'")
                    decoded = decoded.slice(1, -1).replace(/\\'/g, "'");

                const parsed = tryParseJSON(decoded);
                let formatted = null;

                if (parsed.ok) {
                    formatted = formatJSONValue(parsed.value);
                } else if (isXML(decoded)) {
                    formatted = formatXML(decoded);
                } else if (/^[\{\[]/.test(decoded)) {
                    let attempt = decoded.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\r/g, '');
                    try { formatted = formatJSONValue(JSON.parse(attempt)); } catch { }
                }

                if (formatted) {
                    const pre = document.createElement('pre');
                    pre.style.whiteSpace = 'pre-wrap';
                    pre.style.wordBreak = 'break-word';
                    pre.style.margin = '0';
                    pre.style.fontFamily = 'monospace';
                    pre.textContent = formatted;

                    container.innerHTML = '';
                    container.appendChild(pre);
                    container.dataset.formatted = "1";
                } else {
                    container.dataset.formatted = "0";
                }
            });
        });
    }

    function processAll() {
        fields.forEach(f => processField(f));
    }

    // -------- OBSERVER --------
    const main = document.querySelector('#kibana-body') || document.body;

    const observer = new MutationObserver(m => {
        if (m.some(x => x.addedNodes.length > 0)) processAll();
    });

    observer.observe(main, { childList: true, subtree: true });

    setTimeout(processAll, 300);

})();