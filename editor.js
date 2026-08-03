/* Monaco 编辑器 + 轻量 C++ 补全(dev 水准:关键字 / 内置 / 用户自定义标识符) */
(function () {
  "use strict";

  var KEYWORDS = [
    "alignas","alignof","asm","auto","bool","break","case","catch","char","class",
    "const","constexpr","continue","decltype","default","delete","do","double","else",
    "enum","explicit","export","extern","false","float","for","friend","goto","if",
    "inline","int","long","mutable","namespace","new","noexcept","nullptr","operator",
    "private","protected","public","register","return","short","signed","sizeof",
    "static","static_assert","static_cast","struct","switch","template","this",
    "thread_local","throw","true","try","typedef","typeid","typename","union",
    "unsigned","using","virtual","void","volatile","wchar_t","while"
  ];
  // 常用 STL 类型
  var STL_TYPES = [
    "string","vector","map","set","unordered_map","unordered_set","multimap",
    "multiset","queue","deque","stack","priority_queue","pair","tuple","array",
    "list","forward_list","bitset","complex","valarray","initializer_list",
    "istream","ostream","ifstream","ofstream","stringstream","iterator",
    "reverse_iterator","size_t","int64_t","uint64_t","long long","double","char",
    "FILE","NULL"
  ];
  // 常用函数/方法
  var STL_FUNCS = [
    "sort","stable_sort","reverse","find","binary_search","lower_bound","upper_bound",
    "min","max","min_element","max_element","abs","swap","fill","memset","memcpy",
    "strlen","strcmp","strcpy","printf","scanf","puts","getchar","cin","cout","endl",
    "push_back","push_front","pop_back","pop_front","insert","erase","clear","size",
    "empty","begin","end","rbegin","rend","front","back","top","pop","emplace",
    "emplace_back","make_pair","make_tuple","get","to_string","stoi","stoll","atoi",
    "rand","srand","clock","sqrt","pow","floor","ceil","round","log","exp","sin",
    "cos","tan","gcd","lcm","next_permutation","prev_permutation","iota","accumulate",
    "count","count_if","unique","remove","replace","transform","for_each","copy",
    "merge","nth_element","partial_sort","is_sorted","distance","advance","tolower",
    "toupper","exit","assert"
  ];
  var HEADERS = ["#include <bits/stdc++.h>","#include <iostream>","#include <cstdio>",
    "#include <vector>","#include <map>","#include <set>","#include <algorithm>",
    "#include <string>","#include <cstring>","#include <cmath>","#include <queue>",
    "#include <stack>","#include <deque>","#include <unordered_map>",
    "#include <unordered_set>","#include <tuple>","#include <bitset>","#include <functional>"];

  var KEYWORD_SET = {};
  KEYWORDS.forEach(function (k) { KEYWORD_SET[k] = 1; });
  STL_TYPES.forEach(function (k) { KEYWORD_SET[k] = 1; });
  STL_FUNCS.forEach(function (k) { KEYWORD_SET[k] = 1; });

  function extractUserIdentifiers(code) {
    var seen = {}, out = [];
    var re = /\b[A-Za-z_]\w*\b/g, m;
    while ((m = re.exec(code)) !== null) {
      var id = m[0];
      if (KEYWORD_SET[id] || seen[id]) continue;
      seen[id] = 1;
      out.push(id);
    }
    return out;
  }

  var editor = null;

  function registerCompletion() {
    monaco.languages.registerCompletionItemProvider("cpp", {
      triggerCharacters: [".", ":", ">", "#", "<"],
      provideCompletionItems: function (model, position) {
        var code = model.getValue();
        var range = new monaco.Range(position.lineNumber, position.column,
                                     position.lineNumber, position.column);
        var suggestions = [];

        // 关键字
        KEYWORDS.forEach(function (k) {
          suggestions.push({
            label: k, kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: k, range: range, sortText: "0" + k
          });
        });
        // STL 类型
        STL_TYPES.forEach(function (t) {
          suggestions.push({
            label: t, kind: monaco.languages.CompletionItemKind.Class,
            insertText: t, range: range, sortText: "1" + t
          });
        });
        // STL 函数(带括号)
        STL_FUNCS.forEach(function (f) {
          suggestions.push({
            label: f, kind: monaco.languages.CompletionItemKind.Function,
            insertText: f + "($0)", range: range,
            insertTextRules: (monaco.languages.CompletionItemInsertTextRule ||
                              monaco.languages.CompletionItemRule).InsertAsSnippet,
            sortText: "1" + f
          });
        });
        // 头文件(#include 后触发)
        if (/^\s*#\s*include\s*[<"]?$/.test(model.getLineContent(position.lineNumber) ||
            /^\s*#\s*include\s*$/.test(model.getLineContent(position.lineNumber - 1) || ""))) {
          HEADERS.forEach(function (h) {
            suggestions.push({
              label: h.replace("#include ", ""), kind: monaco.languages.CompletionItemKind.File,
              insertText: h + "\n", range: range, sortText: "2"
            });
          });
        }
        // 用户自定义标识符(当前代码中出现的)
        extractUserIdentifiers(code).forEach(function (id) {
          var isFunc = new RegExp("\\b" + id + "\\s*\\(").test(code);
          suggestions.push({
            label: id + (isFunc ? "()" : ""),
            kind: isFunc ? monaco.languages.CompletionItemKind.Function
                         : monaco.languages.CompletionItemKind.Variable,
            insertText: id + (isFunc ? "($0)" : ""), range: range, sortText: "3" + id,
            insertTextRules: isFunc ? ((monaco.languages.CompletionItemInsertTextRule ||
                              monaco.languages.CompletionItemRule).InsertAsSnippet)
                                    : undefined
          });
        });
        return { suggestions: suggestions };
      }
    });
  }

  function init(callback) {
    require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.34.0/min/vs" } });
    require(["vs/editor/editor.main", "vs/basic-languages/cpp/cpp"],
      function () {
        editor = monaco.editor.create(document.getElementById("editorHost"), {
          value: DEFAULT_CODE,
          language: "cpp",
          theme: "vs-dark",
          fontSize: 14,
          tabSize: 4,
          insertSpaces: true,
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "off",
          renderWhitespace: "selection",
          suggest: { snippetsPreventQuickSuggestions: false },
          quickSuggestions: { other: true, comments: false, strings: false },
        });
        registerCompletion();
        // Ctrl+= / Ctrl+- / Ctrl+0 调整字号(中文键盘 + 号是 Shift+=,两个绑定都注册)
        var MOD = monaco.KeyMod.CtrlCmd, KEY = monaco.KeyCode;
        var changeFont = function (d) {
          var cur = editor.getOption(monaco.editor.EditorOption.fontSize);
          var next = Math.max(10, Math.min(32, cur + d));
          if (next !== cur) editor.updateOptions({ fontSize: next });
        };
        editor.addCommand(MOD | KEY.US_EQUALS, function () { changeFont(2); });
        editor.addCommand(MOD | KEY.US_MINUS, function () { changeFont(-2); });
        editor.addCommand(MOD | KEY.KEY_0, function () { editor.updateOptions({ fontSize: 14 }); });
        if (callback) callback();
      });
  }

  var DEFAULT_CODE = [
    "#include <bits/stdc++.h>",
    "using namespace std;",
    "",
    "int main() {",
    "    ios::sync_with_stdio(false);",
    "    cin.tie(nullptr);",
    "",
    "    return 0;",
    "}"
  ].join("\n");

  window.EditorAPI = {
    init: init,
    getCode: function () { return editor ? editor.getValue() : ""; },
    setCode: function (s) { if (editor) editor.setValue(s); },
    getEditor: function () { return editor; },
    DEFAULT_CODE: DEFAULT_CODE,
  };
})();
