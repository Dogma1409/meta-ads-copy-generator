/* public/js/form.js — Gate 4 Phase A.
 *
 * Form controller. Reads the four fields, validates them, exposes a submit
 * hook that runs the callback with a GenerateRequest-shaped payload and
 * disables the button while the callback is in flight.
 *
 * Exposes: window.Form = { read, validate, reset, onSubmit }
 *
 * No build step, no framework. Plain ES2017 that runs in any modern browser.
 */
(function () {
  'use strict'

  var FIELD_IDS = ['product_name', 'product_description', 'audience', 'variations_count']

  function $(id) {
    return document.getElementById(id)
  }

  /**
   * Read the four fields from the DOM. Returns null if any visible text
   * field is empty (the number field always has a value because of `value="3"`).
   */
  function read() {
    var productName = $('product_name').value.trim()
    var productDescription = $('product_description').value.trim()
    var audience = $('audience').value.trim()
    var variationsCountRaw = $('variations_count').value

    if (
      productName.length === 0 ||
      productDescription.length === 0 ||
      audience.length === 0 ||
      variationsCountRaw.length === 0
    ) {
      return null
    }

    var variationsCount = Number(variationsCountRaw)
    if (!Number.isFinite(variationsCount)) {
      return null
    }

    return {
      product_name: productName,
      product_description: productDescription,
      audience: audience,
      variations_count: variationsCount,
    }
  }

  /**
   * Run validation. Returns the first error message (string) or null if
   * the form is valid. The number field has its own min/max but we re-check
   * here in case the user typed a value outside the allowed range.
   */
  function validate() {
    var productName = $('product_name').value.trim()
    var productDescription = $('product_description').value.trim()
    var audience = $('audience').value.trim()
    var variationsCountRaw = $('variations_count').value.trim()

    if (productName.length === 0) return 'Product name is required.'
    if (productDescription.length === 0) return 'Product description is required.'
    if (audience.length === 0) return 'Target audience is required.'
    if (variationsCountRaw.length === 0) return 'Number of variations is required.'

    var variationsCount = Number(variationsCountRaw)
    if (!Number.isInteger(variationsCount)) {
      return 'Number of variations must be an integer.'
    }
    if (variationsCount < 1 || variationsCount > 10) {
      return 'Number of variations must be between 1 and 10.'
    }

    return null
  }

  /** Clear all four fields and restore the default for variations_count. */
  function reset() {
    $('product_name').value = ''
    $('product_description').value = ''
    $('audience').value = ''
    $('variations_count').value = '3'
  }

  /**
   * Wire the Generate button. The callback receives a validated request.
   * The button is disabled (with "Generating…" label) while the callback
   * runs and re-enabled in a finally block — so network errors don't leave
   * the UI stuck.
   */
  function onSubmit(callback) {
    var form = $('generate-form')
    var button = $('generate-btn')
    var originalLabel = button.textContent

    form.addEventListener('submit', function (event) {
      event.preventDefault()

      var error = validate()
      if (error !== null) {
        // Surface validation errors via the Results module so the UX is
        // consistent with server errors.
        if (window.Results && typeof window.Results.error === 'function') {
          window.Results.error(error)
        }
        return
      }

      var request = read()
      if (request === null) {
        if (window.Results && typeof window.Results.error === 'function') {
          window.Results.error('Please fill in all fields before generating.')
        }
        return
      }

      button.disabled = true
      button.textContent = 'Generating…'

      Promise.resolve()
        .then(function () {
          return callback(request)
        })
        .catch(function (err) {
          // Defensive: callback should never throw, but if it does we don't
          // want to leave the button disabled forever.
          // eslint-disable-next-line no-console
          console.error('[form] submit callback threw:', err)
        })
        .finally(function () {
          button.disabled = false
          button.textContent = originalLabel
        })
    })
  }

  window.Form = {
    read: read,
    validate: validate,
    reset: reset,
    onSubmit: onSubmit,
  }

  // FIELD_IDS kept available for tests / future use without being a hidden
  // global. Not strictly required by the spec — cheap to expose.
  window.Form._fieldIds = FIELD_IDS
})()
