# Injector Test Bench UI (Save button + fixed keyboard, offline)

- Клавиатура: нижний ряд `_  -  Space  Backspace  Clear  Enter`, единый цвет (кроме Enter), ровная вертикаль (4fr:1fr).
- Новая кнопка **Save result** после `Drain pump` — сохраняет JSON с результатами (серийник, оси, массивы данных, статус).
- Остальное: офлайн, Chart.js локально (`lib/chart.umd.min.js`), лимиты осей в `config.json`,
  версия по `/api/version`, USB по `/api/usb`.

## API (в браузере)
```js
window.InjectorUI.setStatus('RUN');
window.InjectorUI.setPumps(true, false);
window.InjectorUI.setLive(63.2, 2.41);
window.InjectorUI.setCharts(labels, pressure, flow);
```
