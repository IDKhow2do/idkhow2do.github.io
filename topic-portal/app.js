/**
 * 选题 · 视觉合并入口 — 只读静态预览
 * 数据来自 portal/data/*.json（handoff 复制）；不写回、不请求凭据。
 */
(() => {
  "use strict";

  const DATA = {
    topics: "data/news_topics.json",
    feedback: "data/news_feedback.json",
    visuals: "data/visual_items.json",
    manifest: "data/manifest.json",
    fable52: "data/fable52_videos.json",
  };

  const CATEGORIES = ["全部", "AI", "半导体", "科技产品", "社会生活", "其他"];

  const state = {
    tab: "topics",
    topics: [],
    feedback: {},
    visuals: null,
    manifest: null,
    category: "全部",
    likedOnly: false,
    query: "",
    visualFamily: "全部",
    visualCategory: "",
    visualQuery: "",
    modelFamily: "全部",
    modelQuery: "",
    fable52: null,
    fable52Filter: "全部",
    fable52Query: "",
    visualOverrides: {}, // persisted to localStorage
    topicOverrides: {},
  };

  /** Fable 5.2 kind chips, fixed order after 全部 and 教程. */
  const FABLE_KIND_ORDER = [
    ["short", "短片动画"],
    ["explainer", "科普讲解"],
    ["motion", "动态设计"],
    ["game_capture", "游戏成片"],
    ["tutorial_roundup", "合集导览"],
  ];
  const PROMPT_PROVENANCE_LABEL = {
    original_public: "作者原文",
    adapted: "作者转述",
  };

  /* —— Feedback persistence (localStorage, schema v1; forward-compatible with /api/feedback) —— */
  const FB_STORE = "topicPortal.feedback.v1";
  function loadStoredFeedback() {
    try {
      const raw = JSON.parse(localStorage.getItem(FB_STORE) || "{}");
      for (const [id, r] of Object.entries(raw.signals || {})) {
        if (r.kind === "news") state.topicOverrides[r.key] = { liked: r.liked, saved: r.favorite, notInterested: r.notInterested, ts: r.ts };
        else if (r.kind === "visual") state.visualOverrides[r.key] = { liked: r.liked, favorite: r.favorite, notInterested: r.notInterested, ts: r.ts };
      }
    } catch (e) { console.warn("feedback load failed", e); }
  }
  function collectSignals() {
    const signals = [];
    for (const [key, o] of Object.entries(state.topicOverrides))
      signals.push({ key, kind: "news", liked: !!o.liked, favorite: !!o.saved, notInterested: !!o.notInterested, ts: o.ts || new Date().toISOString() });
    for (const [key, o] of Object.entries(state.visualOverrides))
      signals.push({ key, kind: "visual", liked: !!o.liked, favorite: !!o.favorite, notInterested: !!o.notInterested, ts: o.ts || new Date().toISOString() });
    return signals;
  }
  function saveStoredFeedback() {
    try {
      const map = {};
      for (const sg of collectSignals()) map[sg.kind + "|" + sg.key] = sg;
      localStorage.setItem(FB_STORE, JSON.stringify({ version: 1, signals: map }));
    } catch (e) { console.warn("feedback save failed", e); }
    updateExportCount();
  }
  function updateExportCount() {
    const b = document.getElementById("exportFeedback");
    if (b) b.textContent = `导出反馈 JSON（${collectSignals().length}）`;
  }
  function exportFeedback() {
    const payload = { version: 1, exportedAt: new Date().toISOString(), source: location.href, signals: collectSignals() };
    const d = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `feedback-${d}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`加载失败 ${url}: ${res.status}`);
    return res.json();
  }

  function mergeFeedback(topics, feedbackMap) {
    return topics.map((t) => {
      const fb = feedbackMap[t.url] || {};
      return {
        ...t,
        liked: !!fb.liked,
        saved: !!fb.saved,
        notInterested: !!fb.notInterested,
      };
    });
  }

  function formatShanghai(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      // Asia/Shanghai display
      const parts = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);
      const get = (t) => parts.find((p) => p.type === t)?.value || "";
      return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} CST`;
    } catch {
      return iso;
    }
  }

  const CAT_MARK = {
    AI: "智",
    半导体: "芯",
    科技产品: "品",
    社会生活: "生",
    其他: "·",
    video: "视",
    image: "图",
    motion: "动",
    frontend: "端",
    "3d": "3",
    industrial: "工",
    审美参考: "审",
  };

  const VISUAL_CAT_LABEL = {
    video: "视频",
    image: "图片",
    motion: "动态",
    frontend: "前端",
    "3d": "3D",
    industrial: "工业",
    审美参考: "审美参考",
  };

  /** Extra visual chips keyed by item.category (not styleFamily). */
  const VISUAL_CATEGORY_CHIPS = ["审美参考"];

  /**
   * styleFamily chip keys → Chinese labels (视觉素材 filters).
   * Former "code" (代码) is split into code_video (代码视频：用代码做成的视频/动效成片)
   * and uiux (UI/UX：界面、组件、网页交互). New ingests should set those values directly.
   */
  const VISUAL_FAMILY_ORDER = ["全部", "code_video", "uiux", "draw", "video_model", "model_3d", "other"];
  const VISUAL_FAMILY_LABEL = {
    code_video: "代码视频",
    uiux: "UI/UX",
    draw: "绘图",
    video_model: "视频",
    model_3d: "3D",
    other: "其它",
  };

  function categoryMark(category) {
    const c = category || "其他";
    return CAT_MARK[c] || (c.charAt(0) || "·");
  }

  function visualCategoryLabel(category) {
    const c = category || "未分类";
    return VISUAL_CAT_LABEL[c] || c;
  }

  /** Prefer styleFamily Chinese label when set; fall back to raw category. */
  function visualBadgeLabel(item) {
    const fam = (item && item.styleFamily) || "";
    if (fam && VISUAL_FAMILY_LABEL[fam]) return VISUAL_FAMILY_LABEL[fam];
    return visualCategoryLabel(item && item.category);
  }

  /** List cards: no loud status chip. Drawer: chip only for exceptional absence of caveat. */
  function cardEvidenceHint(topic) {
    // Demoted: almost every topic has caveat — do not chip the grid.
    return null;
  }

  function drawerEvidenceBadge(topic) {
    const hasCaveat = !!(topic.caveat && String(topic.caveat).trim());
    // Special/exceptional: missing boundary note is rarer signal than "has caveat"
    if (!hasCaveat) {
      return { text: "边界待补", cls: "badge-warn" };
    }
    return null;
  }

  function hashHue(str) {
    let h = 0;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  function makeCategoryPlaceholder(category, opts = {}) {
    const el = document.createElement("div");
    el.className = "card-preview-placeholder" + (opts.mutedLabel ? " is-muted-label" : "");
    el.dataset.cat = category || "其他";
    if (opts.seed) {
      const hue = hashHue(opts.seed);
      el.style.setProperty("--tint", `hsla(${hue}, 28%, 42%, 0.12)`);
      el.style.setProperty("--tint2", `hsla(${(hue + 48) % 360}, 22%, 50%, 0.06)`);
    }
    if (opts.mutedLabel) {
      el.textContent = opts.mutedLabel;
    } else if (opts.mark) {
      el.textContent = opts.mark;
      el.setAttribute("aria-hidden", "true");
    } else {
      el.textContent = categoryMark(category);
      el.setAttribute("aria-hidden", "true");
    }
    return el;
  }

  function visualMark(item) {
    const title = displayVisualTitle(item);
    const m = title.match(/@[\w]+/);
    if (m) return m[0].slice(1, 2).toUpperCase();
    const c = (item.category || "").trim();
    if (c === "video" || c === "视频") return "视";
    return categoryMark(c || "其他");
  }

  function displayVisualTitle(item) {
    const raw = (item.title || "").trim();
    // Strip trailing long numeric status IDs if any remain
    let cleaned = raw.replace(/\s*[·•]\s*\d{8,}\s*$/u, "").trim();
    // Drop legacy placeholder titles like「待核实 · @handle」
    if (/^待核实/.test(cleaned)) cleaned = "";
    if (cleaned) return cleaned;
    const desc = (item.description || "").trim().split(/\n/)[0];
    if (desc && desc.length > 8 && !desc.includes("暂未取得") && !desc.includes("待核实")) {
      return desc.length > 72 ? desc.slice(0, 70) + "…" : desc;
    }
    const handle = (item.attribution || "").match(/@[\w]+/);
    if (handle) return handle[0];
    return "未命名素材";
  }
  function effectiveTopicFb(topic) {
    const o = state.topicOverrides[topic.url];
    if (!o) return { liked: topic.liked, saved: topic.saved, notInterested: topic.notInterested };
    return {
      liked: o.liked ?? topic.liked,
      saved: o.saved ?? topic.saved,
      notInterested: o.notInterested ?? topic.notInterested,
    };
  }

  function effectiveVisualFb(item) {
    const key = item.source || item.title;
    const base = item.userFeedback || {};
    const o = state.visualOverrides[key] || {};
    return {
      liked: o.liked ?? !!base.liked,
      favorite: o.favorite ?? !!base.favorite,
      notInterested: o.notInterested ?? !!base.notInterested,
    };
  }

  /* —— Tabs —— */
  function setupTabs() {
    $$(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        state.tab = tab;
        $$(".tab").forEach((b) => {
          const on = b.dataset.tab === tab;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        $$(".panel").forEach((p) => {
          const on = p.id === `panel-${tab}`;
          p.classList.toggle("is-active", on);
          p.hidden = !on;
        });
      });
    });
  }

  /* —— Topics —— */
  function renderCategoryChips() {
    const host = $("#categoryChips");
    host.innerHTML = "";
    CATEGORIES.forEach((cat) => {
      const count =
        cat === "全部"
          ? state.topics.length
          : state.topics.filter((t) => t.category === cat).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (state.category === cat ? " is-active" : "");
      btn.textContent = cat === "全部" ? `全部 ${count}` : `${cat} ${count}`;
      btn.addEventListener("click", () => {
        state.category = cat;
        renderCategoryChips();
        renderTopics();
      });
      host.appendChild(btn);
    });
  }

  function filteredTopics() {
    const q = state.query.trim().toLowerCase();
    return state.topics.filter((t) => {
      if (state.category !== "全部" && t.category !== state.category) return false;
      const fb = effectiveTopicFb(t);
      if (state.likedOnly && !fb.liked) return false;
      if (!q) return true;
      const hay = `${t.title || ""} ${t.description || ""} ${t.source || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderTopics() {
    const grid = $("#topicsGrid");
    const empty = $("#topicsEmpty");
    const hint = $("#topicsHint");
    const list = filteredTopics();

    $("#topicsCount").textContent = String(state.topics.length);
    hint.textContent =
      list.length === state.topics.length
        ? `共 ${list.length} 条选题`
        : `显示 ${list.length} / ${state.topics.length} 条`;

    grid.innerHTML = "";
    if (!list.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    const frag = document.createDocumentFragment();
    list.forEach((topic) => {
      frag.appendChild(buildTopicCard(topic));
    });
    grid.appendChild(frag);
  }

  function buildTopicCard(topic) {
    const fb = effectiveTopicFb(topic);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card";
    btn.setAttribute("aria-label", topic.title);

    const preview = document.createElement("div");
    preview.className = "card-preview";
    const catName = topic.category || "其他";
    if (topic.imageUrl) {
      const img = document.createElement("img");
      img.src = topic.imageUrl;
      img.alt = topic.imageAlt || "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        preview.innerHTML = "";
        preview.appendChild(makeCategoryPlaceholder(catName));
      });
      preview.appendChild(img);
    } else {
      preview.appendChild(makeCategoryPlaceholder(catName));
    }

    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <h3 class="card-title"></h3>
      <div class="card-meta">
        <span class="badge"></span>
        <div class="indicators"></div>
      </div>
    `;
    body.querySelector(".card-title").textContent = topic.title;
    const meta = body.querySelector(".card-meta");
    const oldBadge = body.querySelector(".badge");
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.gap = "8px";
    left.style.flexWrap = "wrap";
    left.style.alignItems = "center";
    const cat = document.createElement("span");
    cat.className = "badge";
    cat.textContent = catName;
    left.appendChild(cat);
    oldBadge.replaceWith(left);

    const inds = body.querySelector(".indicators");
    inds.appendChild(makeInd("♥", "like", fb.liked, (e) => {
      e.stopPropagation();
      toggleTopic(topic.url, "liked");
    }));
    inds.appendChild(makeInd("★", "fav", fb.saved, (e) => {
      e.stopPropagation();
      toggleTopic(topic.url, "saved");
    }));
    inds.appendChild(makeInd("✕", "nope", fb.notInterested, (e) => {
      e.stopPropagation();
      toggleTopic(topic.url, "notInterested");
    }));

    btn.appendChild(preview);
    btn.appendChild(body);
    btn.addEventListener("click", () => openTopicDrawer(topic));
    return btn;
  }

  function makeInd(symbol, kind, on, onClick) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `ind interactive ${kind}` + (on ? " is-on" : "");
    el.textContent = symbol;
    el.title = kind === "like" ? "赞（保存在本机浏览器）" : kind === "fav" ? "收藏（保存在本机浏览器）" : "不感兴趣（保存在本机浏览器）";
    el.addEventListener("click", onClick);
    return el;
  }

  function toggleTopic(url, field) {
    const base = state.topics.find((t) => t.url === url);
    const cur = state.topicOverrides[url] || {
      liked: base?.liked,
      saved: base?.saved,
      notInterested: base?.notInterested,
    };
    const next = { ...cur, [field]: !cur[field], ts: new Date().toISOString() };
    state.topicOverrides[url] = next;
    saveStoredFeedback();
    renderTopics();
    // refresh drawer if open for this topic
    const drawer = $("#drawer");
    if (drawer.classList.contains("is-open") && drawer.dataset.key === url) {
      openTopicDrawer(base);
    }
  }

  function openTopicDrawer(topic) {
    const fb = effectiveTopicFb(topic);
    const drawer = $("#drawer");
    const backdrop = $("#drawerBackdrop");
    drawer.dataset.key = topic.url;
    drawer.dataset.kind = "topic";

    const media = $("#drawerMedia");
    media.innerHTML = "";
    if (topic.imageUrl) {
      const img = document.createElement("img");
      img.src = topic.imageUrl;
      img.alt = topic.imageAlt || "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        media.innerHTML = "";
        media.appendChild(makeCategoryPlaceholder(topic.category || "其他"));
      });
      media.appendChild(img);
    } else {
      media.innerHTML = "";
      const ph = makeCategoryPlaceholder(topic.category || "其他");
      ph.style.height = "100%";
      media.appendChild(ph);
    }

    $("#drawerCategory").textContent = topic.category || "其他";
    $("#drawerTitle").textContent = topic.title || "";
    const status = $("#drawerStatus");
    status.innerHTML = "";
    const special = drawerEvidenceBadge(topic);
    if (special) {
      const b1 = document.createElement("span");
      b1.className = `badge ${special.cls}`.trim();
      b1.textContent = special.text;
      status.appendChild(b1);
    }
    if (topic.source) {
      const b2 = document.createElement("span");
      b2.className = "badge";
      b2.textContent = topic.source;
      status.appendChild(b2);
    }

    $("#drawerDesc").textContent = topic.description || "暂无说明。";
    resetFableDrawerExtras();
    const caveat = (topic.caveat || "").trim();
    $("#drawerCaveatWrap").hidden = !caveat;
    $("#drawerCaveat").textContent = caveat;
    $("#drawerAttrWrap").hidden = true;

    const link = $("#drawerLink");
    link.href = topic.url || "#";
    link.textContent = "打开原文";
    link.style.display = topic.url ? "" : "none";

    const fbHost = $("#drawerFeedback");
    fbHost.innerHTML = "";
    fbHost.appendChild(makeInd("♥", "like", fb.liked, (e) => {
      e.stopPropagation();
      toggleTopic(topic.url, "liked");
    }));
    fbHost.appendChild(makeInd("★", "fav", fb.saved, (e) => {
      e.stopPropagation();
      toggleTopic(topic.url, "saved");
    }));
    fbHost.appendChild(makeInd("✕", "nope", fb.notInterested, (e) => {
      e.stopPropagation();
      toggleTopic(topic.url, "notInterested");
    }));

    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
  }

  /* —— Visuals —— */
  function renderVisualFamilyChips() {
    const host = $("#visualCategoryChips");
    if (!host) return;
    const items = state.visuals?.items || [];
    host.innerHTML = "";
    VISUAL_FAMILY_ORDER.forEach((key) => {
      const count =
        key === "全部"
          ? items.length
          : items.filter((i) => (i.styleFamily || "other") === key).length;
      const label = key === "全部" ? "全部" : VISUAL_FAMILY_LABEL[key] || key;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (state.visualFamily === key ? " is-active" : "");
      btn.textContent = `${label} ${count}`;
      btn.addEventListener("click", () => {
        state.visualFamily = key;
        state.visualCategory = "";
        renderVisualFamilyChips();
        renderVisuals();
      });
      host.appendChild(btn);
    });
    VISUAL_CATEGORY_CHIPS.forEach((cat) => {
      const count = items.filter((i) => i.category === cat).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (state.visualCategory === cat ? " is-active" : "");
      btn.textContent = `${visualCategoryLabel(cat)} ${count}`;
      btn.addEventListener("click", () => {
        state.visualCategory = cat;
        state.visualFamily = "";
        renderVisualFamilyChips();
        renderVisuals();
      });
      host.appendChild(btn);
    });
  }

  function filteredVisuals() {
    const items = state.visuals?.items || [];
    const q = state.visualQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (state.visualCategory) {
        if (item.category !== state.visualCategory) return false;
      } else if (state.visualFamily && state.visualFamily !== "全部") {
        const fam = item.styleFamily || "other";
        if (fam !== state.visualFamily) return false;
      }
      if (!q) return true;
      const hay = `${item.title || ""} ${item.description || ""} ${item.tool || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }

  /**
   * 「3D建模」只读数据里写死的 is3d。判定见 visual_items.json 的 is3dRule：
   * styleFamily model_3d，或标题/标签/描述/工具明确是建模、Blender、Tripo、
   * three.js 场景、GLB、mesh、SDF、体素、程序化 3D、Unity、游戏资产。
   * 这些条目仍留在视觉素材里。
   */
  function is3dItem(item) {
    return !!(item && item.is3d === true);
  }

  function modelPool() {
    return (state.visuals?.items || []).filter(is3dItem);
  }

  function renderModelFamilyChips() {
    const host = $("#modelCategoryChips");
    if (!host) return;
    const items = modelPool();
    host.innerHTML = "";
    VISUAL_FAMILY_ORDER.forEach((key) => {
      const count =
        key === "全部"
          ? items.length
          : items.filter((i) => (i.styleFamily || "other") === key).length;
      const label = key === "全部" ? "全部" : VISUAL_FAMILY_LABEL[key] || key;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (state.modelFamily === key ? " is-active" : "");
      btn.textContent = `${label} ${count}`;
      btn.addEventListener("click", () => {
        state.modelFamily = key;
        renderModelFamilyChips();
        renderModels();
      });
      host.appendChild(btn);
    });
  }

  function filteredModels() {
    const items = modelPool();
    const q = state.modelQuery.trim().toLowerCase();
    return items.filter((item) => {
      const fam = item.styleFamily || "other";
      if (state.modelFamily !== "全部" && fam !== state.modelFamily) return false;
      if (!q) return true;
      const hay = `${item.title || ""} ${item.description || ""} ${item.tool || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderModels() {
    const grid = $("#modelsGrid");
    const empty = $("#modelsEmpty");
    const hint = $("#modelsHint");
    const countEl = $("#modelsCount");
    if (!grid) return;
    const pool = modelPool();
    if (countEl) countEl.textContent = String(pool.length);
    const items = filteredModels();
    grid.innerHTML = "";
    if (hint) {
      hint.textContent =
        items.length === pool.length
          ? `共 ${items.length} 条 3D 建模`
          : `显示 ${items.length} / ${pool.length} 条`;
    }
    if (!items.length) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    const frag = document.createDocumentFragment();
    items.forEach((item) => frag.appendChild(buildVisualCard(item, false)));
    grid.appendChild(frag);
  }

  function renderVisuals() {
    const data = state.visuals;
    const grid = $("#visualsGrid");
    const empty = $("#visualsEmpty");
    const banner = $("#visualGapBanner");
    const hint = $("#visualsHint");

    if (!data) {
      $("#visualsCount").textContent = "0";
      empty.classList.remove("hidden");
      banner.hidden = true;
      grid.innerHTML = "";
      if (hint) hint.textContent = "";
      return;
    }

    const siteTotal = data.siteTotalVerified ?? 113;
    const exported = data.exportedCount ?? (data.items || []).length;
    $("#visualSiteTotal").textContent = String(siteTotal);
    $("#visualExported").textContent = String(exported);
    $("#visualsCount").textContent = `${exported}/${siteTotal}`;

    const incomplete = data.exportStatus === "partial" || exported < siteTotal;
    banner.hidden = !incomplete;
    banner.style.display = incomplete ? "" : "none";

    const allItems = data.items || [];
    const items = filteredVisuals();
    grid.innerHTML = "";

    if (hint) {
      hint.textContent =
        items.length === allItems.length
          ? `共 ${items.length} 条视觉素材`
          : `显示 ${items.length} / ${allItems.length} 条`;
    }

    if (!items.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    // Always show structure: real cards + ghost placeholders for gap (only when unfiltered)
    const frag = document.createDocumentFragment();
    items.forEach((item) => frag.appendChild(buildVisualCard(item, false)));

    const showGhost =
      incomplete &&
      !state.visualCategory &&
      (state.visualFamily === "全部" || state.visualFamily === "") &&
      !state.visualQuery.trim();
    if (showGhost) {
      const ghost = document.createElement("div");
      ghost.className = "card is-ghost";
      const gPrev = document.createElement("div");
      gPrev.className = "card-preview";
      gPrev.appendChild(makeCategoryPlaceholder("其他", { mutedLabel: `其余 ${siteTotal - exported} 条未导出` }));
      const gBody = document.createElement("div");
      gBody.className = "card-body";
      gBody.innerHTML = `
        <h3 class="card-title">等待完整视觉库</h3>
        <div class="card-meta"><span class="badge badge-quiet">导出后刷新</span></div>
      `;
      ghost.appendChild(gPrev);
      ghost.appendChild(gBody);
      frag.appendChild(ghost);
    }

    grid.appendChild(frag);
  }

  function buildVisualCard(item, isGhost, opts) {
    opts = opts || {};
    const fb = effectiveVisualFb(item);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card" + (isGhost ? " is-ghost" : "");

    const preview = document.createElement("div");
    preview.className = "card-preview";
    const vCat = item.category || "其他";
    const seed = displayVisualTitle(item) + (item.source || "");
    const phOpts = { seed, mark: visualMark(item) };
    if (item.previewUrl) {
      const img = document.createElement("img");
      img.src = item.previewUrl;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        preview.innerHTML = "";
        preview.appendChild(makeCategoryPlaceholder(vCat, phOpts));
      });
      preview.appendChild(img);
    } else {
      preview.appendChild(makeCategoryPlaceholder(vCat, phOpts));
    }

    const body = document.createElement("div");
    body.className = "card-body";
    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = displayVisualTitle(item);
    if (item.hook) title.title = item.hook;
    body.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.gap = "6px";
    left.style.flexWrap = "wrap";
    const cat = document.createElement("span");
    cat.className = "badge";
    cat.textContent = visualBadgeLabel(item);
    left.appendChild(cat);
    if (item.category === "审美参考") {
      const topic = document.createElement("span");
      topic.className = "badge";
      topic.textContent = visualCategoryLabel(item.category);
      left.appendChild(topic);
    }
    if (opts.showTutorialBadge && item.hasTutorial === true) {
      const tut = document.createElement("span");
      tut.className = "badge badge-tutorial";
      tut.textContent = "教程";
      left.appendChild(tut);
    }
    meta.appendChild(left);

    const inds = document.createElement("div");
    inds.className = "indicators";
    const key = item.source || item.title;
    inds.appendChild(makeInd("♥", "like", fb.liked, (e) => {
      e.stopPropagation();
      toggleVisual(key, "liked");
    }));
    inds.appendChild(makeInd("★", "fav", fb.favorite, (e) => {
      e.stopPropagation();
      toggleVisual(key, "favorite");
    }));
    inds.appendChild(makeInd("✕", "nope", fb.notInterested, (e) => {
      e.stopPropagation();
      toggleVisual(key, "notInterested");
    }));
    meta.appendChild(inds);
    body.appendChild(meta);

    btn.appendChild(preview);
    btn.appendChild(body);
    btn.addEventListener("click", () => openVisualDrawer(item, opts.drawerKind));
    return btn;
  }

  function itemFeedbackKey(item) {
    return (item && (item.source || item.title)) || "";
  }

  function findItemByKey(list, key) {
    return (list || []).find((i) => itemFeedbackKey(i) === key);
  }

  function toggleVisual(key, field) {
    const drawer = $("#drawer");
    const open = drawer.classList.contains("is-open") && drawer.dataset.key === key;
    const openKind = open ? drawer.dataset.kind : "";
    const visualItem = findItemByKey(state.visuals?.items, key);
    const fableItem = findItemByKey(state.fable52?.items, key);
    const item = (openKind === "fable52" ? fableItem : visualItem) || visualItem || fableItem;
    const base = item
      ? effectiveVisualFb(item)
      : {
          liked: !!state.visualOverrides[key]?.liked,
          favorite: !!state.visualOverrides[key]?.favorite,
          notInterested: !!state.visualOverrides[key]?.notInterested,
        };
    state.visualOverrides[key] = {
      ...base,
      [field]: !base[field],
      ts: new Date().toISOString(),
    };
    saveStoredFeedback();
    renderVisuals();
    renderModels();
    renderFable52();
    if (open) {
      const again = (openKind === "fable52" ? fableItem : visualItem) || visualItem || fableItem;
      if (again) openVisualDrawer(again, openKind === "fable52" ? "fable52" : undefined);
    }
  }

  function resetFableDrawerExtras() {
    const hook = $("#drawerHook");
    if (hook) {
      hook.hidden = true;
      hook.textContent = "";
    }
    const pipeWrap = $("#drawerPipelineWrap");
    if (pipeWrap) pipeWrap.hidden = true;
    const pipe = $("#drawerPipeline");
    if (pipe) pipe.textContent = "";
    const tutWrap = $("#drawerTutorialWrap");
    if (tutWrap) tutWrap.hidden = true;
    const summary = $("#drawerTutorialSummary");
    if (summary) {
      summary.hidden = true;
      summary.textContent = "";
    }
    const pre = $("#drawerPrompt");
    if (pre) {
      pre.hidden = true;
      pre.textContent = "";
    }
    const prov = $("#drawerPromptProvenance");
    if (prov) {
      prov.hidden = true;
      prov.textContent = "";
    }
    const tutLink = $("#drawerTutorialLink");
    if (tutLink) {
      tutLink.hidden = true;
      tutLink.removeAttribute("href");
    }
    const demoLink = $("#drawerDemoLink");
    if (demoLink) {
      demoLink.hidden = true;
      demoLink.removeAttribute("href");
    }
  }

  function isFableDrawerItem(item, drawerKind) {
    if (drawerKind === "fable52") return true;
    if (!item || drawerKind === "visual") return false;
    return typeof item.hasTutorial === "boolean" &&
      (typeof item.pipeline === "string" || typeof item.kind === "string");
  }

  function fillFableDrawerExtras(item) {
    const hookBits = [];
    if ((item.hook || "").trim()) hookBits.push(item.hook.trim());
    if ((item.whatWasMade || "").trim()) hookBits.push(item.whatWasMade.trim());
    const hook = $("#drawerHook");
    if (hook) {
      hook.hidden = hookBits.length === 0;
      hook.textContent = hookBits.join("\n");
    }

    const tool = (item.tool || "").trim();
    const pipeline = (item.pipeline || "").trim();
    const pipeBits = [];
    if (tool) pipeBits.push(tool);
    if (pipeline && pipeline !== tool) pipeBits.push(pipeline);
    const pipeWrap = $("#drawerPipelineWrap");
    const pipe = $("#drawerPipeline");
    if (pipeWrap && pipe) {
      pipeWrap.hidden = pipeBits.length === 0;
      pipe.textContent = pipeBits.join("\n\n");
    }

    const prompt = typeof item.prompt === "string" ? item.prompt : "";
    const promptShown = prompt.trim().length > 0;
    const summaryText = (item.tutorialSummary || "").trim();
    const showTutorial = item.hasTutorial === true || promptShown;
    const tutWrap = $("#drawerTutorialWrap");
    if (tutWrap) tutWrap.hidden = !showTutorial;
    const summary = $("#drawerTutorialSummary");
    if (summary) {
      summary.hidden = !summaryText;
      summary.textContent = summaryText;
    }
    const pre = $("#drawerPrompt");
    if (pre) {
      pre.hidden = !promptShown;
      pre.textContent = promptShown ? prompt : "";
    }
    const prov = $("#drawerPromptProvenance");
    const provLabel = promptShown ? PROMPT_PROVENANCE_LABEL[item.promptProvenance] : "";
    if (prov) {
      prov.hidden = !provLabel;
      prov.textContent = provLabel || "";
    }

    const source = (item.source || "").trim();
    const tutorialUrl = (item.tutorialUrl || "").trim();
    const tutLink = $("#drawerTutorialLink");
    if (tutLink) {
      const showTut = tutorialUrl && tutorialUrl !== source;
      tutLink.hidden = !showTut;
      if (showTut) tutLink.href = tutorialUrl;
      else tutLink.removeAttribute("href");
    }
    const demoUrl = (item.demoUrl || "").trim();
    const demoLink = $("#drawerDemoLink");
    if (demoLink) {
      demoLink.hidden = !demoUrl;
      if (demoUrl) demoLink.href = demoUrl;
      else demoLink.removeAttribute("href");
    }
  }

  function openVisualDrawer(item, drawerKind) {
    const fb = effectiveVisualFb(item);
    const drawer = $("#drawer");
    const backdrop = $("#drawerBackdrop");
    const key = item.source || item.title;
    const fableDrawer = isFableDrawerItem(item, drawerKind);
    drawer.dataset.key = key;
    drawer.dataset.kind = fableDrawer ? "fable52" : "visual";

    const media = $("#drawerMedia");
    media.innerHTML = "";
    if (item.previewUrl) {
      const img = document.createElement("img");
      img.src = item.previewUrl;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        media.innerHTML = `<div class="ph">预览不可用</div>`;
      });
      media.appendChild(img);
    } else {
      media.innerHTML = "";
      media.appendChild(makeCategoryPlaceholder(item.category || "其他"));
    }

    $("#drawerCategory").textContent =
      item.category === "审美参考"
        ? visualCategoryLabel(item.category)
        : visualBadgeLabel(item);
    $("#drawerTitle").textContent = displayVisualTitle(item);
    const status = $("#drawerStatus");
    status.innerHTML = "";
    if (item.category === "审美参考") {
      const fam = document.createElement("span");
      fam.className = "badge";
      fam.textContent = visualBadgeLabel(item);
      status.appendChild(fam);
    }
    const lic = document.createElement("span");
    lic.className = "badge badge-warn";
    lic.textContent = "许可待核";
    status.appendChild(lic);

    $("#drawerDesc").textContent = item.description || "暂无说明。";
    resetFableDrawerExtras();
    if (fableDrawer) fillFableDrawerExtras(item);
    $("#drawerCaveatWrap").hidden = !(item.provenanceNote || "").trim();
    $("#drawerCaveat").textContent = item.provenanceNote || "";

    $("#drawerAttrWrap").hidden = false;
    $("#drawerAttr").textContent =
      item.attribution || "来源署名待核实。本预览不提供下载。";

    const link = $("#drawerLink");
    if (item.source) {
      link.href = item.source;
      link.textContent = fableDrawer ? "打开原帖" : "查看来源";
      link.style.display = "";
    } else {
      link.style.display = "none";
    }

    // Explicitly NO download button

    const fbHost = $("#drawerFeedback");
    fbHost.innerHTML = "";
    fbHost.appendChild(makeInd("♥", "like", fb.liked, (e) => {
      e.stopPropagation();
      toggleVisual(key, "liked");
    }));
    fbHost.appendChild(makeInd("★", "fav", fb.favorite, (e) => {
      e.stopPropagation();
      toggleVisual(key, "favorite");
    }));
    fbHost.appendChild(makeInd("✕", "nope", fb.notInterested, (e) => {
      e.stopPropagation();
      toggleVisual(key, "notInterested");
    }));

    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
  }

  function closeDrawer() {
    const drawer = $("#drawer");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    $("#drawerBackdrop").hidden = true;
  }

  function setupDrawer() {
    $("#drawerClose").addEventListener("click", closeDrawer);
    $("#drawerBackdrop").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
  }

  function setupFilters() {
    $("#topicSearch").addEventListener("input", (e) => {
      state.query = e.target.value;
      renderTopics();
    });
    $("#likedOnly").addEventListener("click", () => {
      state.likedOnly = !state.likedOnly;
      $("#likedOnly").classList.toggle("is-active", state.likedOnly);
      $("#likedOnly").setAttribute("aria-pressed", state.likedOnly ? "true" : "false");
      renderTopics();
    });
    const visualSearch = $("#visualSearch");
    if (visualSearch) {
      visualSearch.addEventListener("input", (e) => {
        state.visualQuery = e.target.value;
        renderVisuals();
      });
    }
    const modelSearch = $("#modelSearch");
    if (modelSearch) {
      modelSearch.addEventListener("input", (e) => {
        state.modelQuery = e.target.value;
        renderModels();
      });
    }
    const fableSearch = $("#fable52Search");
    if (fableSearch) {
      fableSearch.addEventListener("input", (e) => {
        state.fable52Query = e.target.value;
        renderFable52();
      });
    }
  }

  function fablePool() {
    return state.fable52?.items || [];
  }

  function renderFable52Intro() {
    const el = $("#fable52Intro");
    const data = state.fable52;
    if (!el) return;
    el.replaceChildren();
    if (!data) return;
    el.append(document.createTextNode(data.subtitle || data.title || ""));
    const bits = [];
    const pushText = (text) => bits.push(document.createTextNode(text));
    const pushLink = (href, label, title) => {
      if (!href) return;
      if (bits.length) pushText(" · ");
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = label;
      if (title) a.title = title;
      bits.push(a);
    };
    if (data.releaseDate) pushText(`发布 ${data.releaseDate}`);
    pushLink(data.releaseAnnouncementUrl, "官方公告");
    pushLink(data.releasePostUrl, "发布帖");
    const news = Array.isArray(data.relatedNews) ? data.relatedNews : [];
    news.forEach((n, i) => {
      if (!n || !n.url) return;
      if (bits.length) pushText(i === 0 ? " · 相关 " : "、");
      const a = document.createElement("a");
      a.href = n.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = n.title || n.url;
      if (n.note) a.title = n.note;
      bits.push(a);
    });
    if (!bits.length) return;
    const meta = document.createElement("span");
    meta.className = "fable52-meta";
    meta.append(...bits);
    el.append(meta);
  }

  function renderFable52Chips() {
    const host = $("#fable52Chips");
    if (!host) return;
    const items = fablePool();
    host.innerHTML = "";
    const tutorialCount = items.filter((i) => i.hasTutorial === true).length;
    const chips = [
      ["全部", "全部", items.length, ""],
      ["教程", "教程", tutorialCount, "chip-emphasis"],
    ];
    FABLE_KIND_ORDER.forEach(([key, label]) => {
      chips.push([key, label, items.filter((i) => i.kind === key).length, ""]);
    });
    chips.forEach(([key, label, count, extra]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (extra ? " " + extra : "") + (state.fable52Filter === key ? " is-active" : "");
      btn.textContent = `${label} ${count}`;
      btn.addEventListener("click", () => {
        state.fable52Filter = key;
        renderFable52Chips();
        renderFable52();
      });
      host.appendChild(btn);
    });
  }

  function filteredFable52() {
    const q = state.fable52Query.trim().toLowerCase();
    return fablePool().filter((item) => {
      const f = state.fable52Filter;
      if (f === "教程") {
        if (item.hasTutorial !== true) return false;
      } else if (f !== "全部") {
        if (item.kind !== f) return false;
      }
      if (!q) return true;
      const tags = Array.isArray(item.tags) ? item.tags.join(" ") : "";
      const hay = `${item.title || ""} ${item.hook || ""} ${item.description || ""} ${item.tool || ""} ${item.prompt || ""} ${item.sourceAuthor || ""} ${tags}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderFable52() {
    const grid = $("#fable52Grid");
    if (!grid) return;
    const data = state.fable52;
    const all = fablePool();
    const total = data ? (data.itemCount ?? all.length) : 0;
    const countEl = $("#fable52Count");
    if (countEl) countEl.textContent = data ? String(total) : "";
    const items = data ? filteredFable52() : [];
    const hint = $("#fable52Hint");
    if (hint) hint.textContent = data ? `显示 ${items.length} / ${total} 条` : "";
    grid.innerHTML = "";
    const empty = $("#fable52Empty");
    if (!data || !items.length) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    const frag = document.createDocumentFragment();
    items.forEach((item) => {
      frag.appendChild(buildVisualCard(item, false, { showTutorialBadge: true, drawerKind: "fable52" }));
    });
    grid.appendChild(frag);
  }

  function renderMeta() {
    const m = state.manifest;
    if (!m) {
      $("#snapshotMeta").textContent = "快照未加载";
      return;
    }
    const created = formatShanghai(m.createdAtUTC);
    const liked = m.sites?.news?.feedbackCounts?.liked ?? 0;
    $("#snapshotMeta").textContent = `${created} · ${m.sites?.news?.count ?? "—"} 条选题 · ${liked} 赞`;
  }

  async function init() {
    loadStoredFeedback();
    const exp = document.getElementById("exportFeedback");
    if (exp) exp.addEventListener("click", exportFeedback);
    updateExportCount();
    setupTabs();
    setupDrawer();
    setupFilters();

    try {
      const [topicsPack, feedbackPack, visuals, manifest, fable52] = await Promise.all([
        loadJSON(DATA.topics),
        loadJSON(DATA.feedback),
        loadJSON(DATA.visuals),
        loadJSON(DATA.manifest),
        loadJSON(DATA.fable52),
      ]);

      state.feedback = feedbackPack.feedback || {};
      state.topics = mergeFeedback(topicsPack.topics || [], state.feedback);
      state.visuals = visuals;
      state.manifest = manifest;
      state.fable52 = fable52;

      renderMeta();
      renderCategoryChips();
      renderTopics();
      renderVisualFamilyChips();
      renderVisuals();
      renderModelFamilyChips();
      renderModels();
      renderFable52Intro();
      renderFable52Chips();
      renderFable52();
      if (location.hash === "#visuals") $("#tab-visuals")?.click();
      else if (location.hash === "#3d" || location.hash === "#models") $("#tab-models")?.click();
      else if (location.hash === "#fable52" || location.hash === "#fable") $("#tab-fable52")?.click();
    } catch (err) {
      console.error(err);
      $("#snapshotMeta").textContent = "数据加载失败";
      $("#topicsEmpty").classList.remove("hidden");
      $("#topicsEmpty").querySelector("h2").textContent = "无法加载快照数据";
      $("#topicsEmpty").querySelector("p").textContent =
        "请用本地 HTTP 服务打开本页（见 README），并确认 data/ 下 JSON 存在。";
    }
  }

  init();
})();
