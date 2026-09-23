// Админка braverman.kz и кабинет тренера: hash-роутер, сессия по cookie, экраны.
import './admin.css'
import { adminGet, Unauthorized } from './api'
import { parseRoute, navigate } from './router'
import { onRange, setMeta, isAdmin, type Meta } from './state'
import { renderShell } from './layout'
import { renderLogin } from './pages/login'
import { renderDashboard } from './pages/dashboard'
import { renderAttempts } from './pages/attempts'
import { openAttemptDrawer } from './pages/attempt-drawer'
import { renderPayments } from './pages/payments'
import { renderTrainers, renderTrainer } from './pages/trainers'
import { renderHealth } from './pages/health'
import { toast } from './components/toast'

let authed = false
let drawerOpen = false

async function ensureAuth(): Promise<boolean> {
  if (authed) return true
  try {
    setMeta(await adminGet<Meta>('me'))
    authed = true
    return true
  } catch (e) {
    if (e instanceof Unauthorized) return false
    throw e
  }
}

async function render() {
  const route = parseRoute()
  try {
    if (route.name === 'login') { authed = false; return renderLogin() }
    if (!(await ensureAuth())) return navigate('#/login')
    const clients = isAdmin() ? ['Прохождения', 'Все, кто начал тест'] : ['Клиенты', 'Ваши клиенты и их результаты']

    switch (route.name) {
      case 'dashboard': return await renderDashboard(renderShell('dashboard', 'Дашборд', isAdmin() ? 'Воронка, выручка, источники и тренеры' : 'Ваши клиенты за период'))
      case 'attempts': return await renderAttempts(renderShell('attempts', clients[0], clients[1]))
      case 'attempt': {
        if (!document.querySelector('#attempts-page')) await renderAttempts(renderShell('attempt', clients[0], clients[1]))
        if (!drawerOpen) {
          drawerOpen = true
          await openAttemptDrawer(route.id!, () => { drawerOpen = false; if (parseRoute().name === 'attempt') history.replaceState(null, '', '#/attempts') })
        }
        return
      }
      case 'payments': if (!isAdmin()) return navigate('#/'); return await renderPayments(renderShell('payments', 'Оплаты', 'Счета Kaspi и их статусы'))
      case 'trainers': if (!isAdmin()) return navigate('#/'); return await renderTrainers(renderShell('trainers', 'Тренеры', 'Партнёрские ссылки и их результаты'))
      case 'trainer': if (!isAdmin()) return navigate('#/'); return await renderTrainer(renderShell('trainer', 'Тренер', ''), route.id!)
      case 'health': if (!isAdmin()) return navigate('#/'); return await renderHealth(renderShell('health', 'Система', 'Состояние интеграций', false))
    }
  } catch (e) {
    if (e instanceof Unauthorized) { authed = false; return navigate('#/login') }
    console.error(e)
    toast('Ошибка загрузки. Обнови страницу.', 'err')
  }
}

window.addEventListener('hashchange', render)
onRange(render)
render()
