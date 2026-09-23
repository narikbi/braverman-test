// Точка входа теста: атрибуция → аналитика → маршрут по URL и сохранённому состоянию.
import './styles.css'
import { captureAttribution } from './attribution'
import { initAnalytics } from './analytics'
import { applyStatic } from './i18n'
import { state, clearAll, hasProgress, isFinished } from './state'
import { initIntro, showIntro } from './screens/intro'
import { initQuiz, resumeQuiz } from './screens/quiz'
import { initCheckout, renderCheckout } from './screens/checkout'
import { initWaiting, renderWaiting } from './screens/waiting'
import { initResult, openResult } from './screens/result'
import { initRecover, renderRecover } from './screens/recover'

captureAttribution()
initAnalytics()
applyStatic()
initIntro(); initQuiz(); initCheckout(); initWaiting(); initResult(); initRecover()

const qs = new URLSearchParams(location.search)
if (qs.get('reset') === '1') { clearAll(); history.replaceState(null, '', '/') }

const r = qs.get('r')
if (r) openResult(r)
else if (qs.get('recover') === '1') renderRecover()
else if (state.resultToken) openResult(state.resultToken)
else if (state.invoiceId && isFinished()) renderWaiting()
else if (isFinished()) renderCheckout({})
else if (hasProgress()) resumeQuiz()
else showIntro()
