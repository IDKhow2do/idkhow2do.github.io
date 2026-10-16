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
    visualOverrides: {}, // persisted to localStorage
    topicOverrides: {},
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

  /** styleFamily chip keys → Chinese labels (视觉素材 filters) */
  const VISUAL_FAMILY_ORDER = ["全部", "code", "draw", "video_model", "model_3d", "other"];
  const VISUAL_FAMILY_LABEL = {
    code: "代码视频",
    draw: "绘图",
    video_model: "视频模型",
    model_3d: "3D建模",
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

  function buildVisualCard(item, isGhost) {
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
    btn.addEventListener("click", () => openVisualDrawer(item));
    return btn;
  }

  function toggleVisual(key, field) {
    const item = (state.visuals?.items || []).find(
      (i) => (i.source || i.title) === key
    );
    const base = effectiveVisualFb(item || {});
    state.visualOverrides[key] = {
      ...base,
      [field]: !base[field],
      ts: new Date().toISOString(),
    };
    saveStoredFeedback();
    renderVisuals();
    renderModels();
    const drawer = $("#drawer");
    if (drawer.classList.contains("is-open") && drawer.dataset.key === key) {
      openVisualDrawer(item);
    }
  }

  function openVisualDrawer(item) {
    const fb = effectiveVisualFb(item);
    const drawer = $("#drawer");
    const backdrop = $("#drawerBackdrop");
    const key = item.source || item.title;
    drawer.dataset.key = key;
    drawer.dataset.kind = "visual";

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
    $("#drawerCaveatWrap").hidden = !(item.provenanceNote || "").trim();
    $("#drawerCaveat").textContent = item.provenanceNote || "";

    $("#drawerAttrWrap").hidden = false;
    $("#drawerAttr").textContent =
      item.attribution || "来源署名待核实。本预览不提供下载。";

    const link = $("#drawerLink");
    if (item.source) {
      link.href = item.source;
      link.textContent = "查看来源";
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
      const [topicsPack, feedbackPack, visuals, manifest] = await Promise.all([
        loadJSON(DATA.topics),
        loadJSON(DATA.feedback),
        loadJSON(DATA.visuals),
        loadJSON(DATA.manifest),
      ]);

      state.feedback = feedbackPack.feedback || {};
      state.topics = mergeFeedback(topicsPack.topics || [], state.feedback);
      state.visuals = visuals;
      state.manifest = manifest;

      renderMeta();
      renderCategoryChips();
      renderTopics();
      renderVisualFamilyChips();
      renderVisuals();
      renderModelFamilyChips();
      renderModels();
      if (location.hash === "#visuals") $("#tab-visuals")?.click();
      else if (location.hash === "#3d" || location.hash === "#models") $("#tab-models")?.click();
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
