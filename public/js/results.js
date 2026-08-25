/* public/js/results.js — Gate 4 Phase B.
 *
 * Results renderer. Four operations:
 *   - clear(): empties the results and error regions.
 *   - render(variations, meta, scores?): draws a card per variation (with an
 *     optional score badge per card) and a metadata footer with timing /
 *     model / token info.
 *   - error(message): shows a red error box and empties the results.
 *   - setNote(message | null): shows/hides a small non-blocking banner above
 *     the results (used to surface partial failures like "some variations
 *     could not be scored").
 *
 * Exposes: window.Results = { clear, render, error, setNote }
 */
(function () {
  'use strict'

  function $(id) {
    return document.getElementById(id)
  }

  function clear() {
    $('results').innerHTML = ''
    var errorBox = $('error')
    errorBox.innerHTML = ''
    errorBox.hidden = true
  }

  function escapeText(value) {
    // Defensive: variation fields come from an LLM and are rendered with
    // textContent, but we still strip control characters so weird payloads
    // don't break the layout.
    if (value === null || value === undefined) return ''
    return String(value).replace(/[\u0000-\u0008\u000B-\u001F]/g, '')
  }

  // Phase B: pick a color for the score badge based on the fraction of the
  // theoretical maximum. Thresholds: green >= 0.7, amber >= 0.4, red < 0.4.
  function badgeColor(total, maxPossible) {
    if (!maxPossible || maxPossible <= 0) return '#dc2626'
    var ratio = total / maxPossible
    if (ratio >= 0.7) return '#16a34a'
    if (ratio >= 0.4) return '#f59e0b'
    return '#dc2626'
  }

  function buildScoreBadge(score) {
    var badge = document.createElement('span')
    badge.className = 'score-badge'
    badge.textContent = 'Score: ' + score.total + ' / ' + score.max_possible
    badge.style.background = badgeColor(score.total, score.max_possible)
    return badge
  }

  function buildVariationCard(variation, score) {
    var card = document.createElement('article')
    card.className = 'variation-card'

    // Phase B: relative wrapper so the badge can sit top-right of the card
    // without taking it out of the document flow.
    if (score && typeof score.total === 'number' && typeof score.max_possible === 'number') {
      card.appendChild(buildScoreBadge(score))
    }

    var headline = document.createElement('h3')
    headline.className = 'headline'
    headline.textContent = escapeText(variation.headline)

    var primaryText = document.createElement('p')
    primaryText.className = 'primary-text'
    primaryText.textContent = escapeText(variation.primary_text)

    var description = document.createElement('p')
    description.className = 'description'
    description.textContent = escapeText(variation.description)

    card.appendChild(headline)
    card.appendChild(primaryText)
    card.appendChild(description)
    return card
  }

  function render(variations, meta, scores) {
    var results = $('results')
    var errorBox = $('error')
    errorBox.innerHTML = ''
    errorBox.hidden = true
    results.innerHTML = ''

    if (!Array.isArray(variations)) {
      errorBox.textContent = 'Server returned an unexpected response (no variations array).'
      errorBox.hidden = false
      return
    }

    // Graceful degradation: scores are optional and must align 1:1 with
    // variations. If length differs, drop them entirely (Phase B spec).
    var useScores =
      Array.isArray(scores) && scores.length === variations.length

    variations.forEach(function (variation, idx) {
      var score = useScores ? scores[idx] : null
      results.appendChild(buildVariationCard(variation, score))
    })

    var safeMeta = meta || {}
    var count = variations.length
    var ms = safeMeta.duration_ms !== undefined ? safeMeta.duration_ms : '?'
    var model = safeMeta.model_used || 'unknown model'
    var tokensIn = safeMeta.tokens_in !== undefined ? safeMeta.tokens_in : '?'
    var tokensOut = safeMeta.tokens_out !== undefined ? safeMeta.tokens_out : '?'

    var footer = document.createElement('div')
    footer.className = 'results-meta'
    footer.textContent =
      'Generated ' +
      count +
      ' variations in ' +
      ms +
      'ms using ' +
      model +
      ' (' +
      tokensIn +
      '+' +
      tokensOut +
      ' tokens)'
    results.appendChild(footer)
  }

  function error(message) {
    var results = $('results')
    var errorBox = $('error')
    results.innerHTML = ''
    errorBox.textContent = message
    errorBox.hidden = false
  }

  /**
   * Show or hide a small non-blocking note banner above the results.
   * `null` or empty string hides it. The element is created on first use
   * and re-used on subsequent calls (idempotent).
   */
  function setNote(message) {
    var note = $('results-note')
    if (!note) {
      note = document.createElement('div')
      note.id = 'results-note'
      note.className = 'results-note'
      var resultsRegion = $('results')
      if (resultsRegion && resultsRegion.parentNode) {
        resultsRegion.parentNode.insertBefore(note, resultsRegion)
      }
    }
    if (message === null || message === undefined || message === '') {
      note.textContent = ''
      note.hidden = true
      return
    }
    note.textContent = message
    note.hidden = false
  }

  window.Results = {
    clear: clear,
    render: render,
    error: error,
    setNote: setNote,
  }
})()