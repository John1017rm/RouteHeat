(function (global) {
  "use strict";

  var OCR_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";
  var MAX_IMAGE_SIDE = 1600;
  var MAX_IMAGE_BYTES = 30 * 1024 * 1024;
  var FIELD_ORDER = [
    "stops",
    "multiLocationStops",
    "totalLocations",
    "totalPackages",
    "stopsToDo",
    "stopsSuccessful",
    "packagesToDeliver"
  ];
  var FIELD_LABELS = {
    stops: "Total stops",
    multiLocationStops: "Multi-location stops",
    totalLocations: "Total locations",
    totalPackages: "Total packages",
    stopsToDo: "Stops to do",
    stopsSuccessful: "Stops successful",
    packagesToDeliver: "Packages to deliver"
  };
  var FIELD_LIMITS = {
    stops: 1000,
    multiLocationStops: 1000,
    totalLocations: 3000,
    totalPackages: 10000,
    stopsToDo: 1000,
    stopsSuccessful: 1000,
    packagesToDeliver: 10000
  };

  // Specific labels are deliberately considered before the generic Stops,
  // Locations, and Packages rows found on different Amazon summary layouts.
  var SPECS = [
    {
      field: "packagesToDeliver",
      aliases: [
        { text: "packages to deliver", explicit: true },
        { text: "package to deliver", explicit: true },
        { text: "packages remaining", explicit: true }
      ]
    },
    {
      field: "multiLocationStops",
      aliases: [
        { text: "multi location stops", explicit: true },
        { text: "multi location stop", explicit: true },
        { text: "multilocation stops", explicit: true },
        { text: "multilocation stop", explicit: true }
      ]
    },
    {
      field: "stopsSuccessful",
      aliases: [
        { text: "stops successful", explicit: true },
        { text: "successful stops", explicit: true },
        { text: "stops completed", explicit: true },
        { text: "completed stops", explicit: true }
      ]
    },
    {
      field: "stopsToDo",
      aliases: [
        { text: "stops to do", explicit: true },
        { text: "stop to do", explicit: true },
        { text: "stops remaining", explicit: true }
      ]
    },
    {
      field: "totalLocations",
      aliases: [
        { text: "total locations", explicit: true },
        { text: "locations total", explicit: true },
        { text: "delivery locations", explicit: true },
        { text: "locations", explicit: false }
      ]
    },
    {
      field: "totalPackages",
      aliases: [
        { text: "total packages", explicit: true },
        { text: "packages total", explicit: true },
        { text: "package count", explicit: true },
        { text: "packages", explicit: false }
      ]
    },
    {
      field: "stops",
      aliases: [
        { text: "total stops", explicit: true },
        { text: "stops total", explicit: true },
        { text: "delivery stops", explicit: true },
        { text: "stops", explicit: false }
      ]
    }
  ];

  var ocrLoadPromise = null;

  function blankFields() {
    var result = {};
    FIELD_ORDER.forEach(function (key) { result[key] = null; });
    return result;
  }

  function emitProgress(callback, detail) {
    if (typeof callback !== "function") return;
    try { callback(detail); } catch (_) { /* A display callback must not stop OCR. */ }
  }

  function unique(messages) {
    return messages.filter(function (message, index) {
      return message && messages.indexOf(message) === index;
    });
  }

  function canonicalLine(line) {
    return String(line || "")
      .toLowerCase()
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function phraseIndex(line, phrase) {
    var paddedLine = " " + line + " ";
    var index = paddedLine.indexOf(" " + phrase + " ");
    return index < 0 ? -1 : index;
  }

  function numbersIn(line) {
    var results = [];
    var expression = /\d[\d,]{0,7}/g;
    var match;
    while ((match = expression.exec(line))) {
      var digits = match[0].replace(/,/g, "");
      if (!/^\d{1,5}$/.test(digits)) continue;
      results.push({
        value: Number(digits),
        start: match.index,
        end: match.index + match[0].length,
        occurrence: match.index
      });
    }
    return results;
  }

  function standaloneNumber(line) {
    var match = String(line || "").match(/^\s*([0-9]{1,3}(?:,[0-9]{3})?|[0-9]{1,5})\s*[.!]?\s*$/);
    if (!match) return null;
    return Number(match[1].replace(/,/g, ""));
  }

  function exactLabel(line) {
    var best = null;
    SPECS.forEach(function (spec) {
      spec.aliases.forEach(function (alias) {
        if (line !== alias.text) return;
        if (!best || alias.text.length > best.alias.text.length) {
          best = { field: spec.field, alias: alias };
        }
      });
    });
    return best;
  }

  function containsAny(line, phrases) {
    return phrases.some(function (phrase) { return phraseIndex(line, phrase) >= 0; });
  }

  function genericLabelIsSafe(field, line) {
    if (field === "stops") {
      return !containsAny(line, [
        "multi location stops", "multilocation stops", "stops to do",
        "stops remaining", "stops successful", "successful stops",
        "stops completed", "completed stops"
      ]);
    }
    if (field === "totalPackages") {
      return !containsAny(line, ["packages to deliver", "packages remaining"]);
    }
    return true;
  }

  function findSameLineNumber(line, labelStart, labelLength) {
    var candidates = numbersIn(line);
    var labelEnd = labelStart + labelLength;
    var after = candidates
      .filter(function (candidate) { return candidate.start >= labelEnd; })
      .sort(function (a, b) { return a.start - b.start; });
    if (after.length) return { number: after[0], placement: "after" };

    var before = candidates
      .filter(function (candidate) { return candidate.end <= labelStart; })
      .sort(function (a, b) { return b.end - a.end; });
    if (before.length) return { number: before[0], placement: "before" };
    return null;
  }

  function findLabelBlocks(lines, canonicalLines) {
    var assignments = [];
    var index = 0;
    while (index < canonicalLines.length) {
      var labels = [];
      var cursor = index;
      while (cursor < canonicalLines.length) {
        var label = exactLabel(canonicalLines[cursor]);
        if (!label) break;
        labels.push({ lineIndex: cursor, field: label.field, alias: label.alias });
        cursor += 1;
      }

      if (labels.length >= 2) {
        var values = [];
        var valueCursor = cursor;
        while (valueCursor < lines.length && values.length < labels.length) {
          var value = standaloneNumber(lines[valueCursor]);
          if (value === null) break;
          values.push({ lineIndex: valueCursor, value: value });
          valueCursor += 1;
        }
        if (values.length === labels.length) {
          labels.forEach(function (label, offset) {
            assignments.push({
              field: label.field,
              value: values[offset].value,
              score: label.alias.explicit ? 0.82 : 0.76,
              numberKey: values[offset].lineIndex + ":standalone",
              method: "label-grid"
            });
          });
          index = valueCursor;
          continue;
        }
      }
      index += 1;
    }
    return assignments;
  }

  // OCR frequently returns Amazon's summary cards as alternating rows. Score
  // the whole run before assigning anything so a number-above-label layout is
  // not shifted by the equally plausible label-above-next-number pattern.
  function findAlternatingPairs(lines, canonicalLines) {
    function collect(layout) {
      var runs = [];
      var current = [];
      var index = 0;
      while (index < lines.length - 1) {
        var numberIndex = layout === "number-first" ? index : index + 1;
        var labelIndex = layout === "number-first" ? index + 1 : index;
        var value = standaloneNumber(lines[numberIndex]);
        var label = exactLabel(canonicalLines[labelIndex]);
        if (value !== null && label) {
          current.push({
            field: label.field,
            value: value,
            score: label.alias.explicit ? 0.995 : 0.965,
            numberKey: numberIndex + ":standalone",
            method: layout === "number-first" ? "number-label-pairs" : "label-number-pairs",
            explicit: label.alias.explicit
          });
          index += 2;
          continue;
        }
        if (current.length >= 2) runs.push(current);
        current = [];
        index += 1;
      }
      if (current.length >= 2) runs.push(current);
      var assignments = runs.reduce(function (all, run) { return all.concat(run); }, []);
      return {
        assignments: assignments,
        longest: runs.reduce(function (length, run) { return Math.max(length, run.length); }, 0),
        explicitCount: assignments.filter(function (assignment) { return assignment.explicit; }).length
      };
    }

    var candidates = [collect("number-first"), collect("label-first")]
      .filter(function (candidate) { return candidate.assignments.length >= 2; })
      .sort(function (first, second) {
        return second.longest - first.longest
          || second.assignments.length - first.assignments.length
          || second.explicitCount - first.explicitCount;
      });
    return candidates.length ? candidates[0].assignments : [];
  }

  function toInteger(value, key, errors) {
    if (value === null || value === undefined || value === "") return null;
    var normalized = value;
    if (typeof value === "string") {
      normalized = value.trim().replace(/,/g, "");
      if (!/^\d+$/.test(normalized)) {
        errors.push(FIELD_LABELS[key] + " must be a whole number.");
        return null;
      }
      normalized = Number(normalized);
    }
    if (!Number.isFinite(normalized) || Math.floor(normalized) !== normalized || normalized < 0) {
      errors.push(FIELD_LABELS[key] + " must be a non-negative whole number.");
      return null;
    }
    if (normalized > FIELD_LIMITS[key]) {
      errors.push(FIELD_LABELS[key] + " looks too large; please review it.");
      return null;
    }
    return normalized;
  }

  function validate(input) {
    var source = input && input.fields && typeof input.fields === "object" ? input.fields : (input || {});
    var fields = blankFields();
    var errors = [];
    var warnings = [];

    FIELD_ORDER.forEach(function (key) {
      fields[key] = toInteger(source[key], key, errors);
    });

    if (fields.stops === null && fields.stopsToDo !== null && fields.stopsSuccessful !== null) {
      var inferredStops = fields.stopsToDo + fields.stopsSuccessful;
      if (inferredStops <= FIELD_LIMITS.stops) {
        fields.stops = inferredStops;
        warnings.push("Total stops was inferred from stops to do plus stops successful.");
      } else {
        errors.push("The inferred total stops value looks too large; please review it.");
      }
    }

    // Packages to deliver is a remaining count. It is only equivalent to the
    // original package total when the summary explicitly says zero stops have
    // been completed.
    if (fields.totalPackages === null && fields.packagesToDeliver !== null) {
      if (fields.stopsSuccessful === 0) {
        fields.totalPackages = fields.packagesToDeliver;
        warnings.push("Total packages was inferred because zero stops were successful.");
      } else if (fields.stopsSuccessful !== null && fields.stopsSuccessful > 0) {
        warnings.push("Packages to deliver is a remaining count, so it was not used as total packages.");
      }
    }

    if (fields.stops !== null && fields.stopsToDo !== null && fields.stopsSuccessful !== null) {
      var stopParts = fields.stopsToDo + fields.stopsSuccessful;
      if (stopParts !== fields.stops) {
        warnings.push("Total stops does not match stops to do plus stops successful.");
      }
    }
    if (fields.stops !== null && fields.multiLocationStops !== null && fields.multiLocationStops > fields.stops) {
      warnings.push("Multi-location stops is greater than total stops.");
    }
    if (fields.stops !== null && fields.stopsSuccessful !== null && fields.stopsSuccessful > fields.stops) {
      warnings.push("Stops successful is greater than total stops.");
    }
    if (fields.stops !== null && fields.stopsToDo !== null && fields.stopsToDo > fields.stops) {
      warnings.push("Stops to do is greater than total stops.");
    }
    if (fields.stops !== null && fields.totalLocations !== null && fields.totalLocations < fields.stops) {
      warnings.push("Total locations is lower than total stops.");
    }
    if (fields.totalLocations !== null && fields.totalPackages !== null && fields.totalPackages < fields.totalLocations) {
      warnings.push("Total packages is lower than total locations.");
    }
    if (fields.totalPackages !== null && fields.packagesToDeliver !== null && fields.packagesToDeliver > fields.totalPackages) {
      warnings.push("Packages to deliver is greater than total packages.");
    }

    var capturedCount = FIELD_ORDER.reduce(function (count, key) {
      return count + (fields[key] !== null ? 1 : 0);
    }, 0);
    if (!capturedCount) warnings.push("No route summary numbers were found.");

    return {
      valid: errors.length === 0 && capturedCount > 0,
      complete: fields.stops !== null && fields.totalPackages !== null,
      hasRouteBasics: fields.stops !== null,
      fields: fields,
      errors: unique(errors),
      warnings: unique(warnings),
      capturedCount: capturedCount
    };
  }

  function parse(text) {
    var normalizedText = String(text === null || text === undefined ? "" : text)
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .slice(0, 100000);
    var lines = normalizedText
      .split("\n")
      .map(function (line) { return line.trim(); })
      .filter(Boolean)
      .slice(0, 300);
    var canonicalLines = lines.map(canonicalLine);
    var rawFields = blankFields();
    var fieldConfidence = {};
    var methods = {};
    var usedNumbers = {};

    findAlternatingPairs(lines, canonicalLines)
      .concat(findLabelBlocks(lines, canonicalLines))
      .forEach(function (assignment) {
      if (rawFields[assignment.field] !== null || usedNumbers[assignment.numberKey]) return;
      rawFields[assignment.field] = assignment.value;
      fieldConfidence[assignment.field] = assignment.score;
      methods[assignment.field] = assignment.method;
      usedNumbers[assignment.numberKey] = true;
      });

    SPECS.forEach(function (spec) {
      if (rawFields[spec.field] !== null) return;
      var best = null;

      spec.aliases.forEach(function (alias) {
        canonicalLines.forEach(function (line, lineIndex) {
          var labelStart = phraseIndex(line, alias.text);
          if (labelStart < 0) return;
          if (!alias.explicit && !genericLabelIsSafe(spec.field, line)) return;

          var sameLine = findSameLineNumber(line, labelStart, alias.text.length);
          if (sameLine) {
            var sameKey = lineIndex + ":" + sameLine.number.occurrence;
            if (!usedNumbers[sameKey]) {
              var sameScore = alias.explicit ? 0.97 : 0.90;
              if (sameLine.placement === "before") sameScore -= 0.03;
              var sameCandidate = {
                value: sameLine.number.value,
                score: sameScore,
                numberKey: sameKey,
                method: sameLine.placement === "before" ? "number-before-label" : "same-line"
              };
              if (!best || sameCandidate.score > best.score) best = sameCandidate;
            }
          }

          // Adjacent rows are accepted only when the neighboring row is just a
          // number. This avoids interpreting dates, percentages, or other cards.
          [
            { offset: 1, method: "next-line", penalty: 0.08 },
            { offset: -1, method: "previous-line", penalty: 0.10 }
          ].forEach(function (neighbor) {
            var neighborIndex = lineIndex + neighbor.offset;
            if (neighborIndex < 0 || neighborIndex >= lines.length) return;
            var value = standaloneNumber(lines[neighborIndex]);
            var key = neighborIndex + ":standalone";
            if (value === null || usedNumbers[key]) return;
            var score = (alias.explicit ? 0.96 : 0.88) - neighbor.penalty;
            var candidate = { value: value, score: score, numberKey: key, method: neighbor.method };
            if (!best || candidate.score > best.score) best = candidate;
          });
        });
      });

      if (best) {
        rawFields[spec.field] = best.value;
        fieldConfidence[spec.field] = best.score;
        methods[spec.field] = best.method;
        usedNumbers[best.numberKey] = true;
      }
    });

    var beforeValidation = Object.assign({}, rawFields);
    var checked = validate(rawFields);
    if (beforeValidation.stops === null && checked.fields.stops !== null) {
      fieldConfidence.stops = 0.74;
      methods.stops = "inferred-from-stop-status";
    }
    if (beforeValidation.totalPackages === null && checked.fields.totalPackages !== null) {
      fieldConfidence.totalPackages = 0.68;
      methods.totalPackages = "inferred-at-route-start";
    }

    var recognizedConfidence = FIELD_ORDER
      .filter(function (key) { return checked.fields[key] !== null; })
      .map(function (key) { return fieldConfidence[key] || 0.6; });
    var confidence = recognizedConfidence.length
      ? recognizedConfidence.reduce(function (sum, value) { return sum + value; }, 0) / recognizedConfidence.length
      : 0;
    var contradictionCount = checked.warnings.filter(function (warning) {
      return /does not match|greater than|lower than/.test(warning);
    }).length;
    confidence = Math.max(0, Math.min(1, confidence - Math.min(0.2, contradictionCount * 0.05)));

    var warnings = checked.warnings.slice();
    if (checked.fields.stops === null) warnings.push("Total stops was not recognized; enter it before applying.");
    if (checked.fields.totalPackages === null) warnings.push("Total packages was not recognized; it can be entered manually.");

    return {
      fields: checked.fields,
      confidence: Number(confidence.toFixed(2)),
      confidenceLevel: confidence >= 0.85 ? "high" : (confidence >= 0.68 ? "medium" : "low"),
      fieldConfidence: fieldConfidence,
      methods: methods,
      warnings: unique(warnings),
      errors: checked.errors,
      valid: checked.valid,
      complete: checked.complete,
      hasRouteBasics: checked.hasRouteBasics,
      capturedCount: checked.capturedCount
    };
  }

  function formatReview(input) {
    var source = input && input.fields ? input.fields : (input || {});
    var confidence = input && input.fieldConfidence ? input.fieldConfidence : {};
    return FIELD_ORDER.map(function (key) {
      var value = source[key];
      return {
        key: key,
        label: FIELD_LABELS[key],
        value: value === null || value === undefined ? "" : String(value),
        present: value !== null && value !== undefined && value !== "",
        confidence: confidence[key] === undefined ? null : confidence[key],
        max: FIELD_LIMITS[key]
      };
    });
  }

  function loadOCR(onProgress) {
    if (global.Tesseract && typeof global.Tesseract.createWorker === "function") {
      emitProgress(onProgress, { stage: "library", status: "ready", progress: 1 });
      return Promise.resolve(global.Tesseract);
    }
    if (!global.document || !global.document.createElement) {
      return Promise.reject(new Error("Screenshot reading requires a browser window."));
    }
    if (ocrLoadPromise) {
      return ocrLoadPromise.then(function (library) {
        emitProgress(onProgress, { stage: "library", status: "ready", progress: 1 });
        return library;
      });
    }

    emitProgress(onProgress, { stage: "library", status: "loading", progress: 0 });
    ocrLoadPromise = new Promise(function (resolve, reject) {
      var selector = 'script[data-routeheat-ocr="tesseract-7"]';
      var script = global.document.querySelector(selector);
      var created = false;
      if (!script) {
        script = global.document.createElement("script");
        script.src = OCR_SCRIPT_URL;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.dataset.routeheatOcr = "tesseract-7";
        created = true;
      }

      function cleanup() {
        script.removeEventListener("load", loaded);
        script.removeEventListener("error", failed);
      }
      function loaded() {
        cleanup();
        if (global.Tesseract && typeof global.Tesseract.createWorker === "function") {
          script.dataset.routeheatLoaded = "true";
          resolve(global.Tesseract);
        } else {
          reject(new Error("The screenshot reader loaded without its OCR engine."));
        }
      }
      function failed() {
        cleanup();
        reject(new Error("The screenshot reader could not load. Check your connection and try again, or paste Live Text."));
      }

      script.addEventListener("load", loaded, { once: true });
      script.addEventListener("error", failed, { once: true });
      if (created) {
        (global.document.head || global.document.documentElement).appendChild(script);
      } else if (script.dataset.routeheatLoaded === "true") {
        loaded();
      }
    }).then(function (library) {
      emitProgress(onProgress, { stage: "library", status: "ready", progress: 1 });
      return library;
    }).catch(function (error) {
      ocrLoadPromise = null;
      throw error;
    });

    return ocrLoadPromise;
  }

  function decodeImage(file) {
    if (typeof global.createImageBitmap === "function") {
      try {
        return global.createImageBitmap(file, { imageOrientation: "from-image" })
          .then(function (bitmap) {
            return {
              source: bitmap,
              width: bitmap.width,
              height: bitmap.height,
              release: function () { if (typeof bitmap.close === "function") bitmap.close(); }
            };
          })
          .catch(function () { return decodeImageElement(file); });
      } catch (_) {
        return decodeImageElement(file);
      }
    }
    return decodeImageElement(file);
  }

  function decodeImageElement(file) {
    return new Promise(function (resolve, reject) {
      if (!global.URL || !global.Image) {
        reject(new Error("This browser cannot open the selected screenshot."));
        return;
      }
      var objectUrl = global.URL.createObjectURL(file);
      var image = new global.Image();
      image.decoding = "async";
      image.onload = function () {
        global.URL.revokeObjectURL(objectUrl);
        resolve({
          source: image,
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
          release: function () { image.src = ""; }
        });
      };
      image.onerror = function () {
        global.URL.revokeObjectURL(objectUrl);
        reject(new Error("The selected image could not be opened."));
      };
      image.src = objectUrl;
    });
  }

  async function recognizeImage(file, onProgress) {
    if (!file || typeof file.size !== "number") throw new Error("Choose a screenshot first.");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("That screenshot is too large. Choose an image under 30 MB.");
    if (file.type && file.type.indexOf("image/") !== 0) throw new Error("Choose an image file.");
    if (!global.document || !global.document.createElement) {
      throw new Error("Screenshot reading requires a browser window.");
    }

    emitProgress(onProgress, { stage: "image", status: "preparing", progress: 0 });
    var decoded = await decodeImage(file);
    var canvas = null;
    var worker = null;
    try {
      if (!decoded.width || !decoded.height) throw new Error("The screenshot has no readable dimensions.");
      var scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(decoded.width, decoded.height));
      var width = Math.max(1, Math.round(decoded.width * scale));
      var height = Math.max(1, Math.round(decoded.height * scale));
      canvas = global.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      var context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("The screenshot could not be prepared for reading.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(decoded.source, 0, 0, width, height);
      emitProgress(onProgress, { stage: "image", status: "ready", progress: 1, width: width, height: height });

      var Tesseract = await loadOCR(onProgress);
      worker = await Tesseract.createWorker("eng", Tesseract.OEM && Tesseract.OEM.LSTM_ONLY !== undefined
        ? Tesseract.OEM.LSTM_ONLY
        : 1, {
        logger: function (message) {
          emitProgress(onProgress, {
            stage: "recognition",
            status: message.status || "reading",
            progress: Number.isFinite(message.progress) ? message.progress : 0
          });
        },
        errorHandler: function (error) {
          emitProgress(onProgress, { stage: "recognition", status: "error", progress: 0, message: String(error || "") });
        }
      });
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM && Tesseract.PSM.SPARSE_TEXT !== undefined
          ? Tesseract.PSM.SPARSE_TEXT
          : "11",
        preserve_interword_spaces: "1"
      });
      var result = await worker.recognize(canvas);
      var text = result && result.data && result.data.text ? result.data.text : "";
      var ocrConfidence = result && result.data && Number.isFinite(result.data.confidence)
        ? Number(result.data.confidence.toFixed(1))
        : null;
      var parsed = parse(text);
      emitProgress(onProgress, { stage: "recognition", status: "complete", progress: 1 });
      return {
        text: text,
        parsed: parsed,
        fields: parsed.fields,
        confidence: parsed.confidence,
        ocrConfidence: ocrConfidence,
        image: {
          sourceWidth: decoded.width,
          sourceHeight: decoded.height,
          scannedWidth: width,
          scannedHeight: height
        }
      };
    } finally {
      if (worker) {
        try { await worker.terminate(); } catch (_) { /* Release best effort. */ }
      }
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      decoded.release();
    }
  }

  global.RouteHeatIntake = Object.freeze({
    parse: parse,
    validate: validate,
    formatReview: formatReview,
    loadOCR: loadOCR,
    recognizeImage: recognizeImage,
    fieldOrder: FIELD_ORDER.slice(),
    labels: Object.assign({}, FIELD_LABELS),
    maxImageSide: MAX_IMAGE_SIDE,
    ocrScriptUrl: OCR_SCRIPT_URL
  });
})(typeof window !== "undefined" ? window : globalThis);
