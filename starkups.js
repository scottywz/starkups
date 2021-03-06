/*
 ####  #####   ###   ####   ####   #   #   ####  #  #   ####  #  #  #  #   #   #
#        #    #   #  #   #  #   #  #   #  #      # #   #      #  #  #  #  ##   #
 ###     #    #####  ####   ####   #   #  #      ##     ###   #  #  #  #   #   #
    #    #    #   #  #  #   #   #  #   #  #      # #       #               #    
####     #    #   #  #   #  ####    ###    ####  #  #  ####   #  #  #  #  ###  #
*/

/* The format used by the file is called Starkups.  Summary:
    Title
    Tagline (optional; may be 1 or 2 lines long before breaking the page design;
    may contain basic Markdown)
    
    
    // Entries have 2 blank lines in between; format:
    Date(tab)Summary
    Description (optional).  Markdown.
    
    The date and summary line may be split into multiple lines by ending each
    line but the last one with a backslash.
    
    If the summary line starts with a colon or vertical pipe, then the first
    one of those character will be stripped from the beginning of each line
    of the entry as well as one whitespace character after it.  If a line's
    leader is a vertical pipe, then Markdown is disabled for that line and
    line endings are preserved.
    
    Bare URLs will be turned into clickable links.
*/

var autolinker = require("autolinker");
var cheerio = require("cheerio");
var markdown = require("markdown").markdown;


var ENDLINE = /\r\n|\n|\r/;
var LEADERS = [":", "|"];


var Starkups = exports.Starkups = function Starkups(s, reverse) {
 if (!(this instanceof Starkups))
  return new Starkups(s, reverse);
 
 if (s.substr(0, 15).toLowerCase() == "<!doctype html>") {
  var $ = cheerio.load(s);
  if ($(".skp-file").length) {
   var embedded = $(".skp-file").first().text() || "";
   if (typeof(embedded) == "string" && embedded.length)
    s = embedded;
  }
 }
 
 var mainStart = s.search(/\r\n\r\n\r\n|\n\n\n|\r\r\r/);
 var heading = s.substr(0, mainStart).split(ENDLINE);
 
 this.title = sanitize(heading.shift());
 this.subtitle = sanitize(heading.join("\n"));
 this.subtitle.html = function() {
  return mdToHTML(this.subtitle);
 };
 
 this.items = null;  // make items come before reset when inspecting
 
 var i;

 this.items = function(n, itemCallback, endCallback) {
  var result = [];
  
  var blanks = 0;
  var lines = [];
  
  function process(line) {
   line = line.replace(ENDLINE, "");
   if (line != "") {
    // non-blank line
    if (blanks == 1) {
     // delayed processing of single blank line, ignoring leading blank line
     if (lines.length)
      lines.push("");
     blanks = 0;
    }
    lines.push(line);
   } else {
    // blank line
    blanks += 1;
    if (blanks == 2) {
     // end of item
     if (reverse)
      lines.reverse();
     
     if (lines.length) {
      var item = new Item(lines);
      result.push(item);
      if (itemCallback)
       itemCallback(item);
     }
     
     lines = [];
     blanks = 0;
    }
   }
  }
  
  if (!reverse) {
   for (; i < s.length && (n == null || result.length < n);) {
    var line = lineAt(s, i);
    i += line.length;
    process(line);
   }
  } else {
   for (; i > mainStart && (n == null || result.length < n);) {
    var line = lineAt(s, i, true)
    i -= line.length;
    process(line);
   }
  }
  // force processing the last item
  process("");
  process("");
  
  if (endCallback)
   endCallback(result);
  
  return result;
 };
 
 this.renderHeader = function() {
  var result = '';
  result += '<header>\n';
  result += ' <h1 class="title">' + mdToHTML(this.title) + '</h1>\n'
  result += ' <h2 class="subtitle">' + mdToHTML(this.subtitle) + '</h2>\n'
  result += '</header>';
  return result;
 }
 
 this.reset = function() {
 if (!reverse)
  i = mainStart;
 else
  i = s.length - 1;
 };
 this.reset();
};


var Item = exports.Item = function Item(lines) {
 if (!(this instanceof Item))
  return new Item(lines);
 
 if (typeof(lines) == "string")
  lines = lines.replace("\r\n", "\n").replace("\r", "\n").split("\n");
 
 var heading = lines.shift();
 while (heading.substring(heading.length - 1) == "\\")
  heading = heading.substring(0, heading.length - 1) + "\n" + lines.shift();
 var headingParts = heading.split("\t");
 headingParts = [headingParts[0], headingParts.slice(1).join("\t")];
 headingParts[0] = headingParts[0].match(/^([:|]\s*)?(\*\s*)?(.*)$/).slice(1);
 
 this.slug = sanitize(headingParts[0][2]);
 this.summary = sanitize(headingParts[1]);
 this.important = Boolean(headingParts[0][1]);
 this.body = [];

 var useLeader = Boolean((headingParts[0][0] || "").replace(/\s/g, ""));
 if (useLeader) {
  var part = new Part([]);
  for (var i = 0; i < lines.length; i++) {
   var line = lines[i];
   var leader = line.charAt(0);
   if (LEADERS.indexOf(leader) > -1)
    line = line.substr(1).replace(/^\s/, "");
   else
    leader = null;
   if (leader == "|") {
    if (part.isMarkdown) {
     part.pushTo(this.body);
     part = new Part([], false);
    }
   } else {
    if (!part.isMarkdown) {
     part.pushTo(this.body);
     part = new Part([], true);
    }
   }
   part.data.push(sanitize(line));
  }
  part.pushTo(this.body);
 } else {
  new Part(sanitize(lines.join("\n"))).pushTo(this.body);
 }
 
 this.bodyToHTML = function() {
  var result = "";
  for (var i = 0; i < this.body.length; i++) {
   var part = this.body[i];
   if (part.isMarkdown)
    result += '\n' + mdToHTML(part.data);
   else {
    result += '\n<pre><p>';  // pre + p to signal the user's intent
    result += autolink(stripHTML(part.data));
    result += '</p></pre>';
   }
  }
  result = result.substr(1);
  return result;
 }
 
 this.html = function() {
  var result = "";
  result += '<section class="' + ((!this.important) ? "not-" : "") + 'important">\n';
  result += ' <header>\n';
  result += '  <h1>\n';
  result += '   <span class="slug">' + mdToHTML(this.slug) + '</span> \n';
  result += '   <span class="summary">' + mdToHTML(this.summary) + '</span>\n'
  result += '  </h1>\n';
  result += ' </header>\n';
  result += ' <article>\n';
  result += indent(this.bodyToHTML(), 2, true) + "\n";
  result += ' </article>\n';
  result += '</section>';
  return result;
 }
};


var Part = exports.Part = function Part(data, isMarkdown) {
 if (!(this instanceof Part))
  return new Part(data, isMarkdown);
 
 if (data == null) data = "";
 if (isMarkdown == null) isMarkdown = true;
 
 this.data = data;
 this.isMarkdown = isMarkdown;
 
 this.pushTo = function(body) {
  var data = this.data;
  if (typeof(data) != "string") {
   data = data.join("\n");
   body.push(new Part(data, this.isMarkdown));
  } else {
   body.push(this);
  }
 }
}


var mdToHTML = exports.mdToHTML = function(s) {
 return autolink(markdown.toHTML(s, "Maruku"));
};


var autolink = (function() {
 var linker = new autolinker({
  "replaceFn": function(linker, match) {
   var tag = linker.getTagBuilder().build(match);
   tag.setInnerHtml(match.getMatchedText());
   return tag;
  }
 });
 return function(s) { return linker.link(s); };
})();


function sanitize(input) {
 // doesn't do anything yet; just indicates when we *would* need to sanitize
 return input;
}


function indent(s, n, html) {
 s = s.replace(ENDLINE, "\n");
 if (html)
  s = s.replace(/<pre>(.|\n)*?<\/pre>/ig, function(s) {
   return s.replace(/\n/g, "&#x0a;")
  });
 
 var lines = s.split(ENDLINE);
 var prefix = "";
 for (var i = 0; i < n; i++)
  prefix += " ";
 for (var i = 0; i < lines.length; i++)
  lines[i] = prefix + lines[i];
 return lines.join("\n");
}


function lineAt(s, from, reverse) {
 var end = null;
 if (!reverse) {
  for (var i = from; i < s.length; i++) {
   var c = s.substr(i, 1);
   if (c == "\r") {
    end = i;
    if (s.substr(i + 1, 1) == "\n")
     end += 1;
   } else if (c == "\n") {
    end = i;
   }
   if (end != null)
    break;
  }
  if (end == null)
   end = s.length - 1;
  return s.substring(from, end + 1);
 } else {
  var suffix = "";
  for (var i = from; i > 0; i--) {
   var c = s.substr(i, 1);
   if (c == "\n") {
    end = i + 1;
    suffix = "\n";
    if (s.substr(i - 1, 1) == "\r") {
     suffix = "\r" + suffix;
    }
   } else if (c == "\r") {
    end = i + 1;
    suffix = "\r";
   }
   if (end != null)
    break;
  }
  if (end == null)
   end = 0;
  return s.substring(end, from + 1) + suffix;
 }
}


function stripHTML(html) {
 return html.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
}


var test = exports.test = function test() {
 function s(input, reverse) {
  var skp = new Starkups(input, reverse);
  console.log(skp);
  console.log("Header in HTML:");
  console.log(skp.renderHeader());
  console.log("All items:");
  console.log(skp.items());
  skp.reset();
  console.log("0 items:");
  console.log(skp.items(0));
  console.log("1 item:");
  console.log(skp.items(1));
  console.log("1 item:");
  console.log(skp.items(1));
  console.log("1 item:");
  console.log(skp.items(1));
  skp.reset();
  console.log("2 items:");
  console.log(skp.items(2));
  skp.reset();
  console.log("3 items:");
  console.log(skp.items(3));
  skp.reset();
  console.log("First item in HTML:");
  console.log(skp.items(1)[0].html());
  
  console.log("");
 }
 
 s("Title\nSubtitle\n\n* 1\tOne\na\nb\n\nc\n\n\n2\tTwo\nd\n\ne\nf");
 s("Title\nSubtitle\n\n\n* 1\tOne\na\nb\n\nc\n\n\n2\tTwo\nd\n\ne\nf");
 s("Title\nSubtitle\n\n\n* 1\tOne\na\nb\n\nc\n\n\n2\tTwo\nd\n\ne\n<div>f</div>\n\n"
   + "    asdf\n    lkjh\n\nyyy\n\n    qwer\n    poiu\n\n\n: Leader test\n:\n\n|\n| \n| 1\n|\n|\n|2\n: 3\n4\n", true);
};
