/**
 * Copyright 2014 Google Inc. All rights reserved.
 *
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file.
 *
 * @fileoverview Description of this file.
 *
 * A polyfill for HTML Canvas features, including
 * Path2D support.
 */
if (typeof Path2D !== 'function') {
  (function() {

    // Include the SVG path parser.
    //= svgpath.js

    function Path_(arg) {
      this.ops_ = [];
      if (arg == undefined) {
        return;
      }
      if (typeof arg == 'string') {
        try {
          this.ops_ = parser.parse(arg);
        } catch(e) {
          // Treat an invalid SVG path as an empty path.
        }
      } else if (arg.hasOwnProperty('ops_')) {
        this.ops_ = arg.ops_.slice(0);
      } else {
        throw 'Error: ' + typeof arg + 'is not a valid argument to Path';
      }
    };

    // TODO(jcgregorio) test for arcTo and implement via something.

    if (CanvasRenderingContext2D.prototype.ellipse == undefined) {
      CanvasRenderingContext2D.prototype.ellipse = function(x, y, radiusX, radiusY, rotation, startAngle, endAngle, antiClockwise) {
        this.save();
        this.translate(x, y);
        this.rotate(rotation);
        this.scale(radiusX, radiusY);
        this.arc(0, 0, 1, startAngle, endAngle, antiClockwise);
        this.restore();
      }
    }

    // Path methods that map simply to the CanvasRenderingContext2D.
    var simple_mapping = [
      'closePath',
      'moveTo',
      'lineTo',
      'quadraticCurveTo',
      'bezierCurveTo',
      'rect',
      'arc',
      'arcTo',
      'ellipse',
      'isPointInPath',
      'isPointInStroke',
      ];

    function createFunction(name) {
      return function() {
        this.ops_.push({type: name, args: Array.prototype.slice.call(arguments, 0)});
      };
    }

    // Add simple_mapping methods to Path2D.
    for (var i=0; i<simple_mapping.length; i++) {
      var name = simple_mapping[i];
      Path_.prototype[name] = createFunction(name);
    }

    Path_.prototype['addPath'] = function(path, tr) {
      var hasTx = false;
      if (tr
          && tr.hasOwnProperty('a')
          && tr.hasOwnProperty('b')
          && tr.hasOwnProperty('c')
          && tr.hasOwnProperty('d')
          && tr.hasOwnProperty('e')
          && tr.hasOwnProperty('f')) {
        hasTx = true;
        this.ops_.push({type: 'save', args: []});
        this.ops_.push({type: 'transform', args: [tr.a, tr.b, tr.c, tr.d, tr.e, tr.f]});
      }
      this.ops_ = this.ops_.concat(path.ops_);
      if (hasTx) {
        this.ops_.push({type: 'restore', args: []});
      }
    }

    // Add a new method called roundRect which draws rectangles with rounded
    // corners. See proposal here: http://wiki.whatwg.org/wiki/CanvasRoundRect
    Path_.prototype['roundRect'] = function() {
      var x, y, width, height;
      var rtlh, rtlv, rtrh, rtrv, rbrh, rbrv, rblh, rblv;
      if (arguments.length < 4) {
        throw TypeError('Wrong number of arguments.');
      }
      x      = arguments[0];
      y      = arguments[1];
      width  = arguments[2];
      height = arguments[3];
      if (arguments.length == 4+1) {
        rtlh = rtlv = rtrh = rtrv = rbrh = rbrv = rblh = rblv = arguments[4+0];
      } else if (arguments.length == 4+2) {
        rtlh = rtrh = rbrh = rblh = arguments[4+0];
        rtlv = rtrv = rbrv = rblv = arguments[4+1];
      } else if (arguments.length == 4+4) {
       rtlv = rtlh = arguments[4+0];
       rtrv = rtrh = arguments[4+1];
       rbrv = rbrh = arguments[4+2];
       rblv = rblh = arguments[4+3];
      } else if (arguments.length == 4+8) {
       rtlh = arguments[4+0];
       rtlv = arguments[4+1];
       rtrh = arguments[4+2];
       rtrv = arguments[4+3];
       rbrh = arguments[4+4];
       rbrv = arguments[4+5];
       rblh = arguments[4+6];
       rblv = arguments[4+7];
      } else {
        throw TypeError('Wrong number of arguments.');
      }

      // Validate all the radii against the lengths of the rectangle, throw an
      // exception if they exceed.
      if (rtlh + rtrh > width || rblh + rbrh > width || rtlv + rblv > height || rtrv + rbrv > height) {
        throw RangeError('Radii exceed bounds of the rectangle.');
      }

      // The start and end angles for the radii at each corner. We bump up by
      // delta radians as we go from corner to corner.
      var delta = Math.PI/2;
      var start = Math.PI;
      var end   = 3*Math.PI/2;
      // emit all the lines and arcs here.
      this.ops_.push({type: 'closePath', args: []});
      this.ops_.push({type: 'moveTo', args: [x, y+rtlv]});
      this.ops_.push({type: 'ellipse', args: [x+rtlh, y+rtlv, rtlh, rtlv, 0, start, end, false]});
      start += delta;
      end   += delta;
      this.ops_.push({type: 'ellipse', args: [x+width-rtrh, y+rtrv, rtrh, rtrv, 0, start, end, false]});
      start += delta;
      end   += delta;
      this.ops_.push({type: 'ellipse', args: [x+width-rbrh, y+height-rbrv, rbrh, rbrv, 0, start, end, false]});
      start += delta;
      end   += delta;
      this.ops_.push({type: 'ellipse', args: [x+rblh, y+height-rblv, rblh, rblv, 0, start, end, false]});
      this.ops_.push({type: 'closePath', args: []});
    }

    original_fill = CanvasRenderingContext2D.prototype.fill;
    original_stroke = CanvasRenderingContext2D.prototype.stroke;
    original_clip = CanvasRenderingContext2D.prototype.clip;
    original_is_point_in_path = CanvasRenderingContext2D.prototype.isPointInPath;
    original_is_point_in_stroke = CanvasRenderingContext2D.prototype.isPointInStroke;

    // Replace methods on CanvasRenderingContext2D with ones that understand Path2D.
    CanvasRenderingContext2D.prototype.fill = function(arg) {
      if (arg instanceof Path_) {
        this.beginPath();
        for (var i = 0, len = arg.ops_.length; i < len; i++) {
          var op = arg.ops_[i];
          CanvasRenderingContext2D.prototype[op.type].apply(this, op.args);
        }
        original_fill.apply(this, Array.prototype.slice.call(arguments, 1));
      } else {
        original_fill.apply(this, arguments);
      }
    }

    CanvasRenderingContext2D.prototype.stroke = function(arg) {
      if (arg instanceof Path_) {
        this.beginPath();
        for (var i = 0, len = arg.ops_.length; i < len; i++) {
          var op = arg.ops_[i];
          CanvasRenderingContext2D.prototype[op.type].apply(this, op.args);
        }
        original_stroke.call(this);
      } else {
        original_stroke.call(this);
      }
    }

    CanvasRenderingContext2D.prototype.clip = function(arg) {
      if (arg instanceof Path_) {
        // Note that we don't save and restore the context state, since the
        // clip region is part of the state. Not really a problem since the
        // HTML 5 spec doesn't say that clip(path) doesn't affect the current
        // path.
        this.beginPath();
        for (var i = 0, len = arg.ops_.length; i < len; i++) {
          var op = arg.ops_[i];
          CanvasRenderingContext2D.prototype[op.type].apply(this, op.args);
        }
        original_clip.apply(this, Array.prototype.slice.call(arguments, 1));
      } else {
        original_clip.apply(this, arguments);
      }
    }

    CanvasRenderingContext2D.prototype.isPointInPath = function(arg) {
      if (arg instanceof Path_) {
        this.beginPath();
        for (var i = 0, len = arg.ops_.length; i < len; i++) {
          var op = arg.ops_[i];
          CanvasRenderingContext2D.prototype[op.type].apply(this, op.args);
        }
        return original_is_point_in_path.apply(this, Array.prototype.slice.call(arguments, 1));
      } else {
        return original_is_point_in_path.apply(this, arguments);
      }
    }
    CanvasRenderingContext2D.prototype.isPointInStroke = function(arg) {
      if (arg instanceof Path_) {
        this.beginPath();
        for (var i = 0, len = arg.ops_.length; i < len; i++) {
          var op = arg.ops_[i];
          CanvasRenderingContext2D.prototype[op.type].apply(this, op.args);
        }
        return original_is_point_in_stroke.apply(this, Array.prototype.slice.call(arguments, 1));
      } else {
        return original_is_point_in_stroke.apply(this, arguments);
      }
    }

    // Set up externs.
    Path2D = Path_;
  })();
}
