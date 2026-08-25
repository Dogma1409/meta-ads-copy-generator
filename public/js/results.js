/* public/js/results.js — Gate 4 Phase A.
 *
 * Results renderer. Three operations:
 *   - clear(): empties the results and error regions.
 *   - render(variations, meta): draws a card per variation and a metadata
 *     footer with timing / model / token info.
 *   - error(message): shows a red error box and empties the results.
 *
 * Exposes: window.Results = { clear, render, error }
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

  function buildVariationCard(variation) {
    var card = document.createElement('article')
    card.className = 'variation-card'

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

  function render(variations, meta) {
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

    variations.forEach(function (variation) {
      results.appendChild(buildVariationCard(variation))
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

  window.Results = {
    clear: clear,
    render: render,
    error: error,
  }
})()
