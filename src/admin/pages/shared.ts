export function dbMissing(page: HTMLElement) {
  page.innerHTML = `<div class="card"><div class="empty"><div style="font-size:34px">🗄️</div><b>База данных не подключена</b><br /><span style="font-size:13px">Подключи Neon в Vercel (Storage → Neon), выполни <code>npm run db:migrate</code> и передеплой.</span></div></div>`
}
