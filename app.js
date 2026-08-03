/* OJ Helper 前端主逻辑 */
(function () {
  "use strict";

  // ---------------- 工具 ----------------
  function $(sel) { return document.querySelector(sel); }
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET" };
    if (opts.body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(opts.body);
    }
    // 后端地址:同源(空)或独立部署时从 config.js 配置的 apiBase 读取
    var base = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || "";
    return fetch(base + path, init).then(function (r) { return r.json(); });
  }
  function log(msg) {
    console.log("[" + new Date().toLocaleTimeString() + "] " + msg);
  }
  function showTab(name) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    document.querySelectorAll(".tab-pane").forEach(function (p) {
      p.classList.toggle("active", p.id === "tab-" + name);
    });
  }
  function modal(name, open) {
    $("#" + name).classList.toggle("hidden", !open);
  }
  function msg(id, text, isErr) {
    var el = $("#" + id);
    el.textContent = text || "";
    el.className = "msg" + (isErr ? " err" : text ? " ok" : "");
  }

  // ---------------- 状态 ----------------
  var State = {
    pid: "",
    problem: null,
    testing: false,
    submitting: false,
    running: false,
    pollTimer: null,
  };

  // ---------------- 登录 ----------------
  function refreshLogin() {
    return api("/api/auth/status").then(function (r) {
      if (r.logged) {
        $("#userName").textContent = r.user.name;
        $("#userName").classList.remove("hidden");
        var av = $("#avatarBox");
        if (r.user.avatar) {
          $("#avatarImg").src = r.user.avatar;
          av.classList.remove("hidden");
        } else {
          av.classList.add("hidden");
        }
        $("#loginBtn").classList.add("hidden");
        log("已登录洛谷: " + r.user.name);
      } else {
        $("#userName").classList.add("hidden");
        $("#avatarBox").classList.add("hidden");
        $("#loginBtn").classList.remove("hidden");
      }
    });
  }

  // ---------------- 题目 ----------------
  function loadProblem(pid) {
    if (!pid) return;
    State.pid = pid;
    $("#problemTitle").textContent = "加载中…";
    $("#problemMeta").textContent = "";
    api("/api/problem/" + encodeURIComponent(pid)).then(function (r) {
      if (!r.ok) {
        $("#problemTitle").textContent = pid;
        $("#problemBody").innerHTML = '<p class="placeholder">' + esc(r.message) + "</p>";
        log("加载题目失败: " + r.message);
        return;
      }
      State.problem = r;
      renderProblem(r);
      log("已加载题目 " + r.pid + " " + r.title + "(" + r.samples.length + " 个样例)");
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function absUrls(html) {
    return html.replace(/(href|src)="(\/)/g, '$1="https://www.luogu.com.cn$2');
  }

  function section(title, content) {
    if (!content || !content.trim()) return "";
    var md = window.marked ? marked.parse(content) : absUrls(esc(content));
    return "<h2>" + title + "</h2>" + absUrls(md);
  }

  function renderProblem(p) {
    var body = $("#problemBody");
    var diff = { 0: "暂无评定", 1: "入门", 2: "普及-", 3: "普及/提高-",
                 4: "普及+/提高", 5: "提高+/省选-", 6: "省选/NOI-", 7: "NOI/NOI+/CTSC" };
    $("#problemTitle").textContent = p.pid + " " + p.title;
    $("#problemMeta").textContent = diff[p.difficulty] || "难度 " + p.difficulty +
      (p.provider ? " · " + p.provider : "");
    body.innerHTML =
      section("题目背景", p.background) +
      section("题目描述", p.description) +
      section("输入格式", p.inputFormat) +
      section("输出格式", p.outputFormat) +
      section("说明 / 提示", p.hint);
    // 渲染数学公式
    if (window.renderMathInElement) {
      try {
        renderMathInElement(body, {
          delimiters: [
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false }
          ],
          throwOnError: false,
          macros: { "\\bm": "\\mathbf" }
        });
      } catch (e) { log("公式渲染错误: " + e.message); }
    }
    // 样例
    var sl = $("#sampleList");
    sl.innerHTML = "";
    (p.samples || []).forEach(function (s, i) {
      var item = document.createElement("div");
      item.className = "sample-item";
      item.innerHTML = '<div class="s-label">样例 ' + (i + 1) + "</div>" +
        "<pre>输入:<br>" + esc(s[0]) + "</pre>" +
        "<pre>输出:<br>" + esc(s[1]) + "</pre>";
      sl.appendChild(item);
    });
    $("#samplePanel").classList.toggle("hidden", !(p.samples && p.samples.length));
  }

  // ---------------- 一键测试 ----------------
  function currentLang() { return $("#langSel").value; }
  function testLang() { return currentLang().indexOf("C") === 0 && currentLang() !== "C" ? "cpp" : "c"; }

  function runTest() {
    if (State.testing) return;
    if (!State.problem || !State.problem.samples.length) {
      showTab("run");
      $("#runOutput").classList.remove("hidden");
      $("#runStdout").textContent = "该题没有样例,请在上方输入自定义数据后点「运行」。";
      $("#runStderr").textContent = "";
      return;
    }
    State.testing = true;
    $("#testBtn").disabled = true;
    $("#testBtn").textContent = "测试中…";
    showTab("test");
    $("#tab-test").innerHTML = '<p class="rec-msg">正在编译并运行…</p>';
    log("开始测试: " + State.pid);

    api("/api/test", {
      method: "POST",
      body: {
        code: EditorAPI.getCode(),
        lang: testLang(),
        samples: State.problem.samples,
        timeout: Number($("#cfgTimeout").value || 10),
        o2: $("#o2Box").checked,
      }
    }).then(function (r) {
      State.testing = false;
      $("#testBtn").disabled = false;
      $("#testBtn").textContent = "一键测试样例";
      renderTestResult(r);
    });
  }

  function renderTestResult(r) {
    var host = $("#tab-test");
    var html = "";
    if (!r.ok) {
      html += '<div class="compile-box"><span class="err">' + esc(r.message) + "</span>" +
        (r.compile_output ? "<pre>" + esc(r.compile_output) + "</pre>" : "") + "</div>";
      log("测试失败: " + r.message);
    } else if (r.stage === "compile") {
      html += '<div class="compile-box"><span class="err">编译失败</span><pre>' +
        esc(r.compile_output || "(无输出)") + "</pre></div>";
      log("编译失败");
    } else {
      var passCount = r.results.filter(function (c) { return c.status === "PASS"; }).length;
      html += '<div class="compile-box"><span class="' + (passCount === r.results.length ? "ok" : "err") +
        '">编译通过(' + r.compile_time_ms + " ms) · 通过 " + passCount + "/" +
        r.results.length + "</span></div>";
      r.results.forEach(function (c) {
        var cls = c.status === "PASS" ? "pass" : c.status === "FAIL" ? "fail" : "tle";
        html += '<div class="case ' + cls + '"><div class="case-head"><span class="badge ' + cls + '">' +
          esc(c.status) + "</span><span>样例 " + c.index + " · " + c.time_ms + " ms</span></div>" +
          '<div class="case-body"><div><div class="lbl">输入</div><pre>' + esc(c.input || "") +
          "</pre></div><div><div class=\"lbl\">期望输出</div><pre>" + esc(c.expected || "") +
          "</pre></div><div><div class=\"lbl\">实际输出</div><pre>" + esc(c.actual || "") +
          "</pre></div><div><div class=\"lbl\">判定</div><pre>" +
          (c.status === "PASS" ? "与期望输出一致" : c.status === "FAIL" ? "与期望输出不同" :
           c.status === "TLE" ? "运行超时" : "运行时错误") + "</pre></div></div>" +
          (c.stderr ? '<div class="stderr">' + esc(c.stderr) + "</div>" : "") + "</div>";
      });
      log("测试完成: 通过 " + passCount + "/" + r.results.length);
    }
    host.innerHTML = html;
  }

  // ---------------- 自定义运行 ----------------
  function runCustom() {
    if (State.running) return;
    State.running = true;
    $("#runBtn").disabled = true;
    $("#runBtn").textContent = "运行中…";
    showTab("run");
    $("#runOutput").classList.remove("hidden");
    $("#runStdout").textContent = "编译运行中…";
    $("#runStderr").textContent = "";
    api("/api/run", {
      method: "POST",
      body: {
        code: EditorAPI.getCode(),
        lang: testLang(),
        input: $("#runInput").value,
        timeout: Number($("#cfgTimeout").value || 10),
        o2: $("#o2Box").checked,
      }
    }).then(function (r) {
      State.running = false;
      $("#runBtn").disabled = false;
      $("#runBtn").textContent = "运行";
      renderRun(r);
    });
  }

  function renderRun(r) {
    var stdout = $("#runStdout"), stderr = $("#runStderr");
    if (!r.ok) {
      stdout.textContent = "";
      stderr.textContent = (r.message || "运行失败") +
        (r.compile_output ? "\n\n" + r.compile_output : "");
      return;
    }
    if (r.timed_out) {
      stdout.textContent = r.stdout;
      stderr.textContent = "运行超时(> " + ($("#cfgTimeout").value || 10) + " s)";
      return;
    }
    stdout.textContent = r.stdout || "(无输出)";
    var info = "耗时 " + r.time_ms + " ms · 编译 " + r.compile_time_ms + " ms";
    if (r.exit_code !== 0) info += " · 退出码 " + r.exit_code;
    stderr.textContent = (r.stderr || "") + (info ? "\n[" + info + "]" : "");
  }

  // ---------------- 提交 ----------------
  function submit() {
    if (State.submitting) return;
    if (!State.pid) {
      $("#tab-test").innerHTML = '<p class="rec-msg">请先在顶部输入题号并加载题目。</p>';
      showTab("test");
      return;
    }
    State.submitting = true;
    $("#submitBtn").disabled = true;
    $("#submitBtn").textContent = "提交中…";
    showTab("submit");
    $("#tab-submit").innerHTML = '<p class="rec-msg">正在提交…</p>';

    api("/api/submit", {
      method: "POST",
      body: {
        pid: State.pid,
        code: EditorAPI.getCode(),
        lang: currentLang(),
        o2: $("#o2Box").checked,
        accept_langs: State.problem ? State.problem.accept_langs : undefined,
      }
    }).then(function (r) {
      if (!r.ok) {
        State.submitting = false;
        $("#submitBtn").disabled = false;
        $("#submitBtn").textContent = "提交评测";
        $("#tab-submit").innerHTML = '<p class="rec-msg err">提交失败: ' + esc(r.message) + "</p>";
        log("提交失败: " + r.message);
        return;
      }
      log("提交成功, Record ID: " + r.rid + ", 开始轮询评测结果…");
      pollRecord(r.rid);
    });
  }

  function pollRecord(rid) {
    if (State.pollTimer) clearTimeout(State.pollTimer);
    api("/api/record/" + rid).then(function (r) {
      if (!r.ok) {
        State.submitting = false;
        $("#submitBtn").disabled = false;
        $("#submitBtn").textContent = "提交评测";
        $("#tab-submit").innerHTML = '<p class="rec-msg err">' + esc(r.message) + "</p>";
        return;
      }
      renderRecord(r);
      if (!r.finished) {
        State.pollTimer = setTimeout(function () { pollRecord(rid); }, 1500);
      } else {
        State.submitting = false;
        $("#submitBtn").disabled = false;
        $("#submitBtn").textContent = "提交评测";
        log("评测完成: " + r.status_text + " 得分 " + r.score);
      }
    });
  }

  function renderRecord(r) {
    var host = $("#tab-submit");
    var cls = { 2: "ac", 3: "wa", 4: "re", 5: "ce", 6: "tle", 7: "mle" }[r.status] || "pending";
    var html = '<div class="rec-header">Record #' + r.rid +
      ' <span class="verdict ' + cls + '">' + esc(r.status_text) + "</span>" +
      (r.score !== undefined && r.finished ? " · 得分 " + r.score : "") +
      (r.time ? " · " + r.time + " ms" : "") +
      (r.memory ? " · " + r.memory + " KB" : "") + "</div>";
    if (r.compile_message) {
      html += '<div class="compile-box"><span class="err">编译信息</span><pre>' +
        esc(r.compile_message) + "</pre></div>";
    }
    if (r.cases && r.cases.length) {
      html += '<div class="rec-cases"><table><tr><th>#</th><th>结果</th><th>得分</th>' +
        "<th>时间</th><th>内存</th></tr>";
      r.cases.forEach(function (c) {
        var ok = c.status === 2;
        html += "<tr><td>" + c.id + "</td><td class=\"" + (ok ? "ok" : "bad") + "\">" +
          esc(c.status_text) + "</td><td>" + c.score + "</td><td>" + c.time + " ms</td><td>" +
          c.memory + " KB</td></tr>";
      });
      html += "</table></div>";
    }
    if (!r.finished) html += '<p class="rec-msg">评测中,自动刷新…</p>';
    host.innerHTML = html;
  }

  // ---------------- 设置 ----------------
  function loadSettings() {
    api("/api/settings").then(function (r) {
      if (!r.ok) return;
      var s = r.settings;
      var comp = s.compiler || {};
      $("#cfgGpp").value = comp.gpp_path || "";
      $("#cfgCppFlags").value = (comp.cpp_flags || []).join(" ");
      $("#cfgTimeout").value = s.run_timeout;
      $("#cfgConsole").checked = !!s.run_console;
      var lm = s.lang_map || {};
      $("#cfgLangCpp17").value = lm["C++17"] != null ? lm["C++17"] : 3;
      $("#cfgLangCpp20").value = lm["C++20"] != null ? lm["C++20"] : 4;
    });
  }
  function saveSettings() {
    var flags = $("#cfgCppFlags").value.trim().split(/\s+/).filter(Boolean);
    api("/api/settings", {
      method: "POST",
      body: {
        compiler: { gpp_path: $("#cfgGpp").value.trim(), cpp_flags: flags },
        run_timeout: Number($("#cfgTimeout").value) || 10,
        run_console: $("#cfgConsole").checked,
        lang_map: {
          "C++17": Number($("#cfgLangCpp17").value),
          "C++20": Number($("#cfgLangCpp20").value),
        }
      }
    }).then(function (r) {
      msg("settingsMsg", r.ok ? "已保存" : "保存失败", !r.ok);
      if (r.ok) log("设置已保存");
    });
  }

  // ---------------- 事件绑定 ----------------
  function bind() {
    $("#loadBtn").addEventListener("click", function () {
      loadProblem($("#pidInput").value.trim());
    });
    $("#pidInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") loadProblem(this.value.trim());
    });
    $("#testBtn").addEventListener("click", runTest);
    $("#runSamplesBtn").addEventListener("click", runTest);
    $("#runBtn").addEventListener("click", runCustom);
    bindSampleResize();
    $("#submitBtn").addEventListener("click", submit);
    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () { showTab(t.dataset.tab); });
    });
    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { modal(b.dataset.close, false); });
    });
    $("#settingsBtn").addEventListener("click", function () {
      loadSettings(); modal("settingsModal", true);
    });
    $("#loginBtn").addEventListener("click", function () { modal("loginModal", true); });
    $("#cookieLoginBtn").addEventListener("click", function () {
      var ck = $("#cookieInput").value.trim();
      if (!ck) { msg("loginMsg", "请粘贴 Cookie", true); return; }
      api("/api/auth/cookie", { method: "POST", body: { cookie: ck } }).then(function (r) {
        msg("loginMsg", r.logged ? "登录成功: " + r.user.name : "Cookie 无效或未登录", !r.logged);
        if (r.logged) { modal("loginModal", false); refreshLogin(); }
      });
    });
    $("#pwdLoginBtn").addEventListener("click", function () {
      api("/api/auth/login", {
        method: "POST",
        body: { username: $("#loginUser").value.trim(), password: $("#loginPass").value }
      }).then(function (r) {
        msg("loginMsg", r.message || (r.ok ? "登录成功" : "登录失败"), !r.ok);
        if (r.ok) { modal("loginModal", false); refreshLogin(); }
      });
    });
    $("#fetchCookieBtn").addEventListener("click", function () {
      window.open("https://www.luogu.com.cn/", "_blank");
      msg("loginMsg", "请在打开的洛谷页面登录,然后按 F12 → 网络/Application 中找到 Cookie 复制回来", true);
    });
    $("#saveSettingsBtn").addEventListener("click", saveSettings);
    $("#resetCookieBtn").addEventListener("click", function () {
      api("/api/auth/logout", { method: "POST" }).then(function () {
        msg("settingsMsg", "已清除洛谷登录", false);
        refreshLogin();
      });
    });
    $("#langSel").addEventListener("change", function () {
      var ed = EditorAPI.getEditor();
      if (ed) monaco.editor.setModelLanguage(ed.getModel(), testLang());
    });
    // 点击空白关闭弹窗
    document.querySelectorAll(".modal").forEach(function (m) {
      m.addEventListener("click", function (e) {
        if (e.target === m) m.classList.add("hidden");
      });
    });
  }

  // 样例面板高度拖拽
  function bindSampleResize() {
    var bar = $("#sampleResize"), panel = $("#samplePanel");
    var startY = 0, startH = 0, dragging = false;
    bar.addEventListener("mousedown", function (e) {
      dragging = true;
      startY = e.clientY;
      startH = panel.getBoundingClientRect().height;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    });
    document.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      var h = startH + (startY - e.clientY);
      var max = panel.parentElement.getBoundingClientRect().height * 0.65;
      h = Math.max(120, Math.min(h, max));
      panel.style.height = h + "px";
    });
    document.addEventListener("mouseup", function () {
      dragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    });
  }

  // ---------------- 启动 ----------------
  function boot() {
    bind();
    refreshLogin();
    loadSettings();
    log("OJ Helper 已启动。顶部输入题号加载题目,右侧编写代码。");
    log("提示:本工具测试样例在本地编译运行,提交需先在设置中登录洛谷。");
    // 尝试预加载一个样例题(P1000),方便立刻体验
    loadProblem("P1000");
  }

  function loadScripts(list, cb) {
    var i = 0;
    function next() {
      if (i >= list.length) return cb();
      var s = document.createElement("script");
      s.src = list[i++];
      s.onload = next;
      s.onerror = next;   // 加载失败也继续(仅公式不渲染)
      document.head.appendChild(s);
    }
    next();
  }

  function loadKatexAndBoot() {
    var need = [];
    if (!window.katex) need.push("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js");
    if (!window.renderMathInElement) {
      need.push("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js");
    }
    if (need.length) loadScripts(need, boot); else boot();
  }

  EditorAPI.init(loadKatexAndBoot);
})();
