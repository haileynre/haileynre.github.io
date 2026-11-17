(function () {
  var D = window.OPTOUT;
  var HOURS = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  var LAGS = [
    { id: "5", label: "Under 5 min", test: function (n) { return n < 5; } },
    { id: "15", label: "5–15 min", test: function (n) { return n >= 5 && n < 15; } },
    { id: "60", label: "15–60 min", test: function (n) { return n >= 15 && n < 60; } },
    { id: "180", label: "1–3 hours", test: function (n) { return n >= 60 && n < 180; } },
    { id: "day", label: "3–24 hours", test: function (n) { return n >= 180 && n < 1440; } },
    { id: "more", label: "Over a day", test: function (n) { return n >= 1440; } }
  ];
  var state = {
    days: new Set([0, 1, 2, 3]),
    phase: null,
    template: null,
    hour: null,
    keyword: null
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function tmpl(id) {
    for (var i = 0; i < D.templates.length; i++) {
      if (D.templates[i].id === id) return D.templates[i];
    }
    return null;
  }

  function phaseLabel(id) {
    for (var i = 0; i < D.phases.length; i++) {
      if (D.phases[i].id === id) return D.phases[i].label;
    }
    return id;
  }

  function hourLabel(h) {
    var hr = h % 12 || 12;
    return hr + (h < 12 ? "am" : "pm");
  }

  function median(nums) {
    if (!nums.length) return null;
    var s = nums.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    if (s.length % 2) return s[mid];
    return Math.round((s[mid - 1] + s[mid]) / 2);
  }

  function fmtLag(mins) {
    if (mins == null) return "—";
    if (mins < 60) return mins + " min";
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h < 24) return m ? h + "h " + m + "m" : h + "h";
    var d = Math.floor(h / 24);
    return d + "d " + (h % 24) + "h";
  }

  function rowPhase(row) {
    var t = tmpl(row[5]);
    return t ? t.phase : "other";
  }

  function match(row, skip) {
    if (!state.days.has(row[1])) return false;
    if (skip !== "phase" && state.phase && rowPhase(row) !== state.phase) return false;
    if (skip !== "template" && state.template !== null && row[5] !== state.template) return false;
    if (skip !== "hour" && state.hour !== null && row[2] !== state.hour) return false;
    if (skip !== "keyword" && state.keyword !== null && row[4] !== state.keyword) return false;
    return true;
  }

  function rows(skip) {
    var out = [];
    for (var i = 0; i < D.rows.length; i++) {
      if (match(D.rows[i], skip)) out.push(D.rows[i]);
    }
    return out;
  }

  function people(list) {
    var set = {};
    for (var i = 0; i < list.length; i++) set[list[i][0]] = 1;
    return Object.keys(set).length;
  }

  function pct(n, d) {
    if (!d || !n) return "0%";
    var p = (100 * n) / d;
    if (p < 1) return "<1%";
    return Math.round(p) + "%";
  }

  function chip(label, pressed, attrs, count) {
    var n = count == null ? "" : '<span class="n">' + count + "</span>";
    return '<button type="button" class="chip" aria-pressed="' + pressed + '" ' + attrs + ">" +
      esc(label) + n + "</button>";
  }

  function renderFilters(list) {
    var html = '<span class="group-label">Day</span>';
    html += chip("All four", state.days.size === 4, 'data-day="all"');
    // counts per day respect every filter except the day set, so a phase still shows where it landed
    for (var i = 0; i < D.days.length; i++) {
      var n = 0;
      for (var r = 0; r < D.rows.length; r++) {
        var row = D.rows[r];
        if (row[1] !== i) continue;
        var saved = state.days;
        state.days = new Set([i]);
        var ok = match(row, null);
        state.days = saved;
        if (ok) n++;
      }
      html += chip(D.days[i].short, state.days.has(i) && state.days.size < 4, 'data-day="' + i + '"', n);
    }
    html += '<span class="group-label">Text</span>';
    var phaseRows = rows("phase");
    for (var p = 0; p < D.phases.length; p++) {
      var id = D.phases[p].id;
      var pn = 0;
      for (var j = 0; j < phaseRows.length; j++) {
        if (rowPhase(phaseRows[j]) === id) pn++;
      }
      if (!pn && state.phase !== id) continue;
      html += chip(D.phases[p].label, state.phase === id, 'data-phase="' + id + '"', pn);
    }
    document.getElementById("filters").innerHTML = html;

    var bits = [];
    if (state.days.size < 4) {
      bits.push(Array.from(state.days).sort().map(function (d) { return D.days[d].label; }).join(", "));
    }
    if (state.phase) bits.push(phaseLabel(state.phase));
    if (state.hour !== null) bits.push(hourLabel(state.hour));
    if (state.keyword !== null) bits.push("reply “" + D.keywords[state.keyword] + "”");
    if (state.template !== null) {
      var chosen = tmpl(state.template);
      bits.push(chosen ? "one outbound text" : "missing text");
    }
    var active = document.getElementById("active");
    if (!bits.length) {
      active.hidden = true;
      active.innerHTML = "";
    } else {
      active.hidden = false;
      active.innerHTML = "Showing " + esc(bits.join(" · ")) +
        ' <button type="button" id="clear">Clear filters</button>';
    }
  }

  function renderStats(list) {
    var lags = [];
    var fast = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i][6] != null) {
        lags.push(list[i][6]);
        if (list[i][6] < 5) fast++;
      }
    }
    var uniq = people(list);
    var med = median(lags);
    document.getElementById("stats").innerHTML =
      stat(list.length, "Opt-out replies") +
      stat(uniq, uniq === 1 ? "Person" : "People") +
      stat(list.length ? pct(fast, list.length) : "—", "Replied in under 5 minutes") +
      stat(med == null ? "—" : fmtLag(med), "Median time after the text");
  }

  function stat(value, label) {
    return '<div class="stat"><b>' + esc(value) + "</b><span>" + esc(label) + "</span></div>";
  }

  function renderHours(list) {
    var counts = {};
    var max = 1;
    for (var i = 0; i < HOURS.length; i++) counts[HOURS[i]] = 0;
    for (var r = 0; r < list.length; r++) {
      counts[list[r][2]] = (counts[list[r][2]] || 0) + 1;
      if (counts[list[r][2]] > max) max = counts[list[r][2]];
    }
    var html = "";
    for (var h = 0; h < HOURS.length; h++) {
      var hour = HOURS[h];
      var n = counts[hour] || 0;
      var w = Math.round((100 * n) / max);
      html += '<button type="button" class="bar" data-hour="' + hour + '" aria-pressed="' +
        (state.hour === hour) + '">' +
        '<span class="bar-label">' + hourLabel(hour) + "</span>" +
        '<span class="track"><span class="fill" style="--w:' + w + '%"></span></span>' +
        '<span class="bar-n">' + n + "</span></button>";
    }
    document.getElementById("hours").innerHTML = html || '<p class="empty">No replies in this filter.</p>';
  }

  function renderLag(list) {
    var lags = [];
    var missing = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i][6] == null) missing++;
      else lags.push(list[i][6]);
    }
    if (!list.length) {
      document.getElementById("lag").innerHTML = '<p class="empty">No replies in this filter.</p>';
      return;
    }
    var max = 1;
    var counts = LAGS.map(function (bucket) {
      var n = 0;
      for (var i = 0; i < lags.length; i++) if (bucket.test(lags[i])) n++;
      if (n > max) max = n;
      return n;
    });
    var html = "";
    for (var b = 0; b < LAGS.length; b++) {
      if (!counts[b] && b > 3) continue;
      var w = Math.round((100 * counts[b]) / max);
      html += '<div class="lag-row"><div class="meta"><span>' + esc(LAGS[b].label) +
        "</span><b>" + counts[b] + "</b></div>" +
        '<div class="track"><span class="fill" style="--w:' + w + '%"></span></div></div>';
    }
    html += '<p class="lag-note">' + pct(counts[0], list.length) +
      " of these replies came within 5 minutes. " +
      (missing ? missing + " had no prior 76819 text in this range." : "Every reply in this view had a prior text.") +
      "</p>";
    document.getElementById("lag").innerHTML = html;
  }

  function renderHeat() {
    var counts = {};
    var max = 1;
    for (var i = 0; i < D.rows.length; i++) {
      var row = D.rows[i];
      if (!match(row, "hour")) continue;
      var key = row[1] + "-" + row[2];
      counts[key] = (counts[key] || 0) + 1;
      if (counts[key] > max) max = counts[key];
    }
    var html = '<div class="heat"><span></span>';
    for (var h = 0; h < HOURS.length; h++) html += '<span class="h">' + hourLabel(HOURS[h]).replace("m", "") + "</span>";
    for (var d = 0; d < D.days.length; d++) {
      if (!state.days.has(d) && state.days.size < 4) continue;
      html += '<span class="d">' + esc(D.days[d].short) + "</span>";
      for (var hr = 0; hr < HOURS.length; hr++) {
        var n = counts[d + "-" + HOURS[hr]] || 0;
        var alpha = n ? Math.round(18 + 82 * (n / max)) : 0;
        var pressed = state.hour === HOURS[hr] && state.days.size === 1 && state.days.has(d);
        html += '<button type="button" class="cell' + (n ? " on" : "") + '" style="--a:' + alpha + '%" data-day="' + d +
          '" data-hour="' + HOURS[hr] + '" aria-pressed="' + pressed + '" aria-label="' +
          esc(D.days[d].label + " " + hourLabel(HOURS[hr]) + ", " + n + (n === 1 ? " reply" : " replies")) +
          '"><span class="tip">' + n + "</span></button>";
      }
    }
    html += "</div>";
    document.getElementById("heat").innerHTML = html;
  }

  function renderKeywords() {
    var list = rows("keyword");
    var counts = {};
    for (var i = 0; i < list.length; i++) {
      var k = list[i][4];
      counts[k] = (counts[k] || 0) + 1;
    }
    var order = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (!order.length) {
      document.getElementById("keywords").innerHTML = '<p class="empty">No replies in this filter.</p>';
      return;
    }
    var html = "";
    for (var j = 0; j < order.length; j++) {
      var id = Number(order[j]);
      html += chip(D.keywords[id], state.keyword === id, 'data-keyword="' + id + '"', counts[id]);
    }
    document.getElementById("keywords").innerHTML = html;
  }

  function renderTemplates() {
    var list = rows("template");
    var groups = {};
    for (var i = 0; i < list.length; i++) {
      var id = list[i][5];
      if (!groups[id]) groups[id] = [];
      groups[id].push(list[i]);
    }
    var ids = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });
    if (!ids.length) {
      document.getElementById("templates").innerHTML = '<p class="empty">No replies in this filter.</p>';
      return;
    }
    var max = groups[ids[0]].length;
    var html = '<div class="tmpl-list">';
    for (var t = 0; t < ids.length; t++) {
      var id = Number(ids[t]);
      var group = groups[id];
      var item = id < 0 ? null : tmpl(id);
      var text = item ? item.text : "No outbound from 76819 earlier in November 13–16";
      var phase = item ? item.phase : "other";
      var lags = [];
      for (var g = 0; g < group.length; g++) if (group[g][6] != null) lags.push(group[g][6]);
      var med = median(lags);
      var w = Math.round((100 * group.length) / max);
      html += '<button type="button" class="tmpl" data-template="' + id + '" aria-pressed="' +
        (state.template === id) + '">' +
        '<span class="tmpl-n">' + group.length + "</span>" +
        '<span class="tmpl-text">' + esc(text) + "</span>" +
        '<span class="tmpl-meta"><span class="phase ' + phase + '">' + esc(phaseLabel(phase)) + "</span>" +
        people(group) + " " + (people(group) === 1 ? "person" : "people") +
        (med == null ? "" : " · median " + fmtLag(med)) +
        " · " + pct(group.length, list.length) + " of this view" +
        '<span class="meter"><span style="--w:' + w + '%"></span></span></span></button>';
    }
    html += "</div>";
    document.getElementById("templates").innerHTML = html;
  }

  function render() {
    var list = rows(null);
    renderFilters(list);
    renderStats(list);
    renderHours(rows("hour"));
    renderLag(list);
    renderHeat();
    renderKeywords();
    renderTemplates();
  }

  document.body.addEventListener("click", function (event) {
    var btn = event.target.closest("button");
    if (!btn) return;
    if (btn.id === "clear") {
      state.days = new Set([0, 1, 2, 3]);
      state.phase = null;
      state.template = null;
      state.hour = null;
      state.keyword = null;
      render();
      return;
    }
    if (btn.dataset.day != null && btn.dataset.hour == null && btn.closest("#filters")) {
      if (btn.dataset.day === "all") state.days = new Set([0, 1, 2, 3]);
      else {
        var day = Number(btn.dataset.day);
        if (state.days.size === 4) state.days = new Set([day]);
        else if (state.days.has(day)) {
          if (state.days.size === 1) state.days = new Set([0, 1, 2, 3]);
          else state.days.delete(day);
        } else state.days.add(day);
      }
      render();
      return;
    }
    if (btn.dataset.phase != null && btn.closest("#filters")) {
      var phase = btn.dataset.phase;
      state.phase = state.phase === phase ? null : phase;
      if (state.template !== null) {
        var chosen = tmpl(state.template);
        if (state.phase && chosen && chosen.phase !== state.phase) state.template = null;
      }
      render();
      return;
    }
    if (btn.dataset.hour != null && btn.closest("#hours")) {
      var hour = Number(btn.dataset.hour);
      state.hour = state.hour === hour ? null : hour;
      render();
      return;
    }
    if (btn.dataset.hour != null && btn.closest("#heat")) {
      var heatDay = Number(btn.dataset.day);
      var heatHour = Number(btn.dataset.hour);
      var same = state.hour === heatHour && state.days.size === 1 && state.days.has(heatDay);
      if (same) {
        state.hour = null;
        state.days = new Set([0, 1, 2, 3]);
      } else {
        state.days = new Set([heatDay]);
        state.hour = heatHour;
      }
      render();
      return;
    }
    if (btn.dataset.keyword != null) {
      var kw = Number(btn.dataset.keyword);
      state.keyword = state.keyword === kw ? null : kw;
      render();
      return;
    }
    if (btn.dataset.template != null) {
      var id = Number(btn.dataset.template);
      state.template = state.template === id ? null : id;
      render();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      state.days = new Set([0, 1, 2, 3]);
      state.phase = null;
      state.template = null;
      state.hour = null;
      state.keyword = null;
      render();
    }
  });

  render();
})();
