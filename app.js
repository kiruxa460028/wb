(function () {
  const ALL_WAREHOUSES = "##ALL_WAREHOUSES##";
  const AUTH_USERS_KEY = "wbsp_users_v1";
  const AUTH_SESSION_KEY = "wbsp_session_v1";
  const API_TOKEN_MAP_KEY = "wbsp_api_tokens_v1";
  const DATA_CACHE_MAP_KEY = "wbsp_data_cache_v1";
  const PRODUCT_NAME_CACHE_MAP_KEY = "wbsp_product_names_v1";
  const USER_SETTINGS_MAP_KEY = "wbsp_user_settings_v1";
  const USER_CABINETS_MAP_KEY = "wbsp_user_cabinets_v1";
  const REMOTE_KEY_API_TOKEN = "api_token";
  const REMOTE_KEY_DATA_CACHE = "data_cache";
  const REMOTE_KEY_PRODUCT_NAMES = "product_names";
  const REMOTE_KEY_USER_SETTINGS = "user_settings";
  const REMOTE_KEY_CABINETS = "user_cabinets";
  const API_REFRESH_MS = 20 * 60 * 1000;
  const API_BUTTON_COOLDOWN_MS = 10 * 1000;
  const MSK_WAREHOUSES = ["коледино", "рязань (тюшевское)", "подольск", "тула", "электросталь"];

  const state = {
    originalData: [],
    processedData: [],
    shipmentResultData: [],
    abcResultData: [],
    redistributionData: [],
    inTransitMap: {},
    daysInReport: 30,
    currentUserKey: "",
    activeCabinetId: "cabinet-1",
    cabinets: [],
    analyticsMode: "stock",
    expandedAnalyticsSkus: new Set(),
    expandedAnalyticsWarehouses: new Set(),
    showWarehouseDetails: false,
    lowStockDays: 20,
    overstockDays: 45,
    lastApiActionAt: 0,
    apiAutoRefreshTimer: null,
    lastDataUpdateAt: 0,
    excludedSkus: new Set(),
    useOnlySkuList: false,
    salesPlanMap: {},
    calcMode: "demand",
    turnoverDays: 45,
    selectedCalcWarehouses: [],
    availableCalcWarehouses: [],
    warehouseShareMap: {},
    warehouseSelectionTouched: false,
    autoWarehouseShare: false,
    dailyOrdersBySku: {},
    // Сохранённые агрегированные заказы Ozon из CSV (компактный формат, не сырые строки)
    // Структура: { specific: {"артикул__склад": {ordered,bought}}, global: {"артикул": {ordered,bought}} }
    ozonOrdersCsvAgg: null,
  };

  const el = {
    appShell: q("#app-shell"),
    authGate: q("#auth-gate"),
    userMenuBtn: q("#user-menu-btn"),
    userMenuDropdown: q("#user-menu-dropdown"),
    cabinetSwitcherWrap: q("#cabinet-switcher-wrap"),
    cabinetSwitcherBtn: q("#cabinet-switcher-btn"),
    cabinetSwitcherMenu: q("#cabinet-switcher-menu"),
    cabinetSwitcherList: q("#cabinet-switcher-list"),
    cabinetAddBtn: q("#cabinet-add-btn"),
    openSettingsBtn: q("#open-settings-btn"),
    closeSettingsBtn: q("#close-settings-btn"),
    settingsPanel: q("#settings-panel"),
    settingsTabButtons: qa("[data-settings-tab]"),
    settingsApiTab: q("#settings-api-tab"),
    settingsMarkersTab: q("#settings-markers-tab"),
    settingsFiltersPlanTab: q("#settings-filters-plan-tab"),
    logoutBtn: q("#logout-btn"),
    navDashboardBtn: q("#nav-dashboard-btn"),
    navAnalyticsBtn: q("#nav-analytics-btn"),
    navAnalyticsStockBtn: q("#nav-analytics-stock-btn"),
    navAnalyticsWarehouseBtn: q("#nav-analytics-warehouse-btn"),
    navAnalyticsTurnoverBtn: q("#nav-analytics-turnover-btn"),
    navCalcBtn: q("#nav-calc-btn"),
    pageDashboard: q("#page-dashboard"),
    pageAnalytics: q("#page-analytics"),
    pageCalc: q("#page-calc"),
    analyticsStockSection: q("#analytics-stock-section"),
    analyticsWarehouseSection: q("#analytics-warehouse-section"),
    analyticsTurnoverSection: q("#analytics-turnover-section"),
    goCalcBtn: q("#go-calc-btn"),
    authTabLogin: q("#auth-tab-login"),
    authTabRegister: q("#auth-tab-register"),
    loginForm: q("#login-form"),
    registerForm: q("#register-form"),
    loginUsername: q("#login-username"),
    loginPassword: q("#login-password"),
    registerUsername: q("#register-username"),
    registerPassword: q("#register-password"),
    registerPasswordRepeat: q("#register-password-repeat"),
    authMessage: q("#auth-message"),

    mainFileInput: q("#main-file-input"),
    shipmentFileInput: q("#shipment-file-input"),
    searchInput: q("#search-input"),
    warehouseFilter: q("#warehouse-filter"),
    combineMsk: q("#combine-msk"),
    excludeMsk: q("#exclude-msk"),
    enableRounding: q("#enable-rounding"),
    hideSmall: q("#hide-small-shipments"),
    showOnlyRisk: q("#show-only-risk"),
    hideOverstockTurnover: q("#hide-overstock-turnover"),
    targetDays: q("#target-days"),
    deliveryDate: q("#delivery-date"),
    calcMethod: q("#calc-method"),
    optimalDays: q("#optimal-days"),
    turnoverDays: q("#turnover-days"),
    calcDemandMode: q("#calc-demand-mode"),
    calcWarehousesDropdownWrap: q("#calc-warehouses-dropdown-wrap"),
    calcWarehousesDropdownBtn: q("#calc-warehouses-dropdown-btn"),
    calcWarehousesDropdown: q("#calc-warehouses-dropdown"),
    calcWarehousesSearch: q("#calc-warehouses-search"),
    calcWarehousesChecklist: q("#calc-warehouses-checklist"),
    calcWarehousesSelectAllBtn: q("#calc-warehouses-select-all-btn"),
    calcWarehousesResetBtn: q("#calc-warehouses-reset-btn"),
    autoWarehouseShare: q("#auto-warehouse-share"),
    warehouseShareGrid: q("#warehouse-share-grid"),
    lowStockDays: q("#settings-low-stock-days"),
    overstockDays: q("#settings-overstock-days"),
    settingsSkuList: q("#settings-sku-list"),
    settingsUseOnlySkuList: q("#settings-use-only-sku-list"),
    settingsSalesPlanInput: q("#settings-sales-plan-input"),
    settingsSalesPlanStatus: q("#settings-sales-plan-status"),
    calculateShipmentBtn: q("#calculate-shipment-btn"),
    calculateAbcBtn: q("#calculate-abc-btn"),
    calculateRedistributionBtn: q("#calculate-redistribution-btn"),
    reportViewToggleBtn: q("#report-view-toggle-btn"),
    downloadShipmentBtn: q("#download-shipment-btn"),
    exportCsvBtn: q("#export-csv-btn"),
    exportXlsxBtn: q("#export-xlsx-btn"),
    exportAllBtn: q("#export-all-btn"),
    importCsvInput: q("#import-csv-input"),
    downloadTemplateBtn: q("#download-template-btn"),
    recalcAllBtn: q("#recalc-all-btn"),
    migrateProfileBtn: q("#migrate-profile-btn"),
    syncPushBtn: q("#sync-push-btn"),
    syncStatus: q("#sync-status"),
    backupCreateBtn: q("#backup-create-btn"),
    backupsList: q("#backups-list"),
    switchShipmentTabBtn: q("#switch-shipment-tab-btn"),
    apiTokenInput: q("#api-token-input"),
    wbTokenField: q("#wb-token-field"),
    ozonClientIdField: q("#ozon-client-id-field"),
    ozonApiKeyField: q("#ozon-api-key-field"),
    ozonClientIdInput: q("#ozon-client-id-input"),
    ozonApiKeyInput: q("#ozon-api-key-input"),
    ozonStocksXlsxInput: q("#ozon-stocks-xlsx-input"),
    ozonOrdersCsvInput: q("#ozon-orders-csv-input"),
    clearOzonCsvBtn: q("#clear-ozon-csv-btn"),
    apiDateFrom: q("#api-date-from"),
    apiTestBtn: q("#api-test-btn"),
    apiLoadStocksBtn: q("#api-load-stocks-btn"),
    apiTestResult: q("#api-test-result"),

    status: q("#status"),
    shipmentStatus: q("#shipment-status"),
    dashboardMarkers: q("#dashboard-markers"),
    dashboardTopTable: q("#dashboard-top-table"),
    analyticsSearchInput: q("#analytics-search-input"),
    analyticsCategoryFilter: q("#analytics-category-filter"),
    analyticsSortSelect: q("#analytics-sort-select"),
    analyticsWarehouseSearchInput: q("#analytics-warehouse-search-input"),
    analyticsWarehouseSortSelect: q("#analytics-warehouse-sort-select"),
    analyticsMarkers: q("#analytics-markers"),
    analyticsReportTable: q("#analytics-report-table"),
    analyticsWarehouseTable: q("#analytics-warehouse-table"),
    analyticsTurnoverTable: q("#analytics-turnover-table"),
    reportTable: q("#report-table"),
    shipmentTable: q("#shipment-table"),
    abcTable: q("#abc-table"),
    redistributionTable: q("#redistribution-table"),

    kpiStock: q("#kpi-stock"),
    kpiForecast: q("#kpi-forecast"),
    kpiShipment: q("#kpi-shipment"),
    kpiRisk: q("#kpi-risk"),
    kpiRiskNote: q("#kpi-risk-note"),

    sumUnits: q("#sum-units"),
    sumBoxes: q("#sum-boxes"),
    sumDate: q("#sum-date"),
    sumSaving: q("#sum-saving"),
    donut: q("#donut"),
    donutValue: q("#donut-value"),

    heroMiniChart: q("#hero-mini-chart"),
    forecastChart: q("#forecast-chart"),
  };

  void boot();

  async function boot() {
    if (!(await initAuth())) return;
    bindEvents();
    initTabs();
    drawHeroMiniChart([]);
    drawForecastChart([], []);
    initApiDate();
    renderAll();
  }

  async function initAuth() {
    bindAuthEvents();
    const session = getSession();
    if (!session) {
      showAuthGate();
      return false;
    }
    const remoteExists = await backendUserExists(session);
    const localUser = getUsers().find((u) => u.usernameKey === session);
    if (!remoteExists && !localUser) {
      clearSession();
      showAuthGate();
      return false;
    }
    state.currentUserKey = session;
    loadCabinetsForCurrentUser();
    showApp(localUser?.username || session);
    await hydrateUserScopedDataFromBackend();
    applyCabinetContext();
    startApiAutoRefresh();
    return true;
  }

  function bindAuthEvents() {
    el.authTabLogin?.addEventListener("click", () => switchAuthTab("login"));
    el.authTabRegister?.addEventListener("click", () => switchAuthTab("register"));

    el.loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = normalizeUsername(el.loginUsername.value);
      const password = el.loginPassword.value || "";
      if (!username || password.length < 6) {
        setAuthMessage("Введите корректный логин и пароль (минимум 6 символов).");
        return;
      }
      const remoteLogin = await backendLogin(username, password);
      if (remoteLogin.ok) {
        setSession(remoteLogin.usernameKey || username);
        location.reload();
        return;
      }
      if (remoteLogin.available && !remoteLogin.ok) {
        if (remoteLogin.error === "not_found") setAuthMessage("Пользователь не найден.");
        else if (remoteLogin.error === "invalid_password") setAuthMessage("Неверный пароль.");
        else setAuthMessage("Ошибка входа через сервер.");
        return;
      }
      const user = getUsers().find((u) => u.usernameKey === username);
      if (!user) {
        setAuthMessage("Пользователь не найден.");
        return;
      }
      const hash = await hashPassword(password, user.salt);
      if (hash !== user.passwordHash) {
        setAuthMessage("Неверный пароль.");
        return;
      }
      setSession(user.usernameKey);
      location.reload();
    });

    el.registerForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const usernameRaw = (el.registerUsername.value || "").trim();
      const username = normalizeUsername(usernameRaw);
      const password = el.registerPassword.value || "";
      const repeat = el.registerPasswordRepeat.value || "";

      if (username.length < 3) {
        setAuthMessage("Логин должен быть от 3 символов.");
        return;
      }
      if (password.length < 6) {
        setAuthMessage("Пароль должен быть от 6 символов.");
        return;
      }
      if (password !== repeat) {
        setAuthMessage("Пароли не совпадают.");
        return;
      }

      const remoteRegister = await backendRegister(usernameRaw, password);
      if (remoteRegister.ok) {
        setSession(remoteRegister.usernameKey || username);
        location.reload();
        return;
      }
      if (remoteRegister.available && remoteRegister.error === "user_exists") {
        setAuthMessage("Такой логин уже существует.");
        return;
      }
      if (remoteRegister.available && !remoteRegister.ok) {
        setAuthMessage("Не удалось зарегистрироваться на сервере.");
        return;
      }

      const users = getUsers();
      if (users.some((u) => u.usernameKey === username)) {
        setAuthMessage("Такой логин уже существует.");
        return;
      }

      const salt = randomSalt();
      const passwordHash = await hashPassword(password, salt);
      users.push({
        username: usernameRaw,
        usernameKey: username,
        salt,
        passwordHash,
        createdAt: new Date().toISOString(),
      });
      saveUsers(users);
      setSession(username);
      location.reload();
    });

    el.logoutBtn?.addEventListener("click", () => {
      if (state.apiAutoRefreshTimer) {
        clearInterval(state.apiAutoRefreshTimer);
        state.apiAutoRefreshTimer = null;
      }
      clearSession();
      location.reload();
    });
  }

  function switchAuthTab(tab) {
    const login = tab === "login";
    el.authTabLogin.classList.toggle("active", login);
    el.authTabRegister.classList.toggle("active", !login);
    el.loginForm.classList.toggle("hidden", !login);
    el.registerForm.classList.toggle("hidden", login);
    setAuthMessage("");
  }

  function showAuthGate() {
    el.authGate.classList.remove("hidden");
    el.appShell.classList.add("hidden");
    switchAuthTab("login");
  }

  function showApp(username) {
    el.authGate.classList.add("hidden");
    el.appShell.classList.remove("hidden");
    if (el.userMenuBtn) {
      el.userMenuBtn.textContent = `Пользователь: ${username}`;
    }
    renderCabinetSwitcher();
    switchPage("dashboard");
  }

  function setAuthMessage(message) {
    el.authMessage.textContent = message;
  }

  function getUsers() {
    try {
      const raw = localStorage.getItem(AUTH_USERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
  }

  function getUserCabinetsMap() {
    try {
      const raw = localStorage.getItem(USER_CABINETS_MAP_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveUserCabinetsMap(map) {
    localStorage.setItem(USER_CABINETS_MAP_KEY, JSON.stringify(map));
  }

  function loadCabinetsForCurrentUser() {
    if (!state.currentUserKey) return;
    const map = getUserCabinetsMap();
    const saved = map[state.currentUserKey];
    if (!saved || !Array.isArray(saved.cabinets) || !saved.cabinets.length) {
      state.cabinets = [{ id: "cabinet-1", name: "Кабинет 1", platform: "wb", ozonClientId: "", ozonApiKey: "" }];
      state.activeCabinetId = "cabinet-1";
      persistCabinetsForCurrentUser();
      return;
    }
    state.cabinets = saved.cabinets
      .map((c) => ({
        id: String(c.id || ""),
        name: String(c.name || "").trim(),
        platform: String(c.platform || "wb").toLowerCase() === "ozon" ? "ozon" : "wb",
        ozonClientId: String(c.ozonClientId || ""),
        ozonApiKey: String(c.ozonApiKey || ""),
      }))
      .filter((c) => c.id && c.name);
    if (!state.cabinets.length) {
      state.cabinets = [{ id: "cabinet-1", name: "Кабинет 1", platform: "wb", ozonClientId: "", ozonApiKey: "" }];
    }
    const active = String(saved.activeCabinetId || "");
    state.activeCabinetId = state.cabinets.some((c) => c.id === active) ? active : state.cabinets[0].id;
  }

  function persistCabinetsForCurrentUser() {
    if (!state.currentUserKey) return;
    const map = getUserCabinetsMap();
    map[state.currentUserKey] = {
      activeCabinetId: state.activeCabinetId,
      cabinets: state.cabinets.map((c) => ({
        id: c.id,
        name: c.name,
        platform: c.platform || "wb",
        ozonClientId: c.ozonClientId || "",
        ozonApiKey: c.ozonApiKey || "",
      })),
      updatedAt: Date.now(),
    };
    saveUserCabinetsMap(map);
    syncRemoteUserData(REMOTE_KEY_CABINETS, map[state.currentUserKey]);
  }

  function renderCabinetSwitcher() {
    if (!el.cabinetSwitcherBtn || !el.cabinetSwitcherList) return;
    const current = getActiveCabinet();
    const currentTag = current?.platform === "ozon" ? "Ozon" : "WB";
    el.cabinetSwitcherBtn.textContent = current ? `Кабинет: ${current.name} (${currentTag})` : "Кабинет";
    let html = "";
    state.cabinets.forEach((cabinet) => {
      const cls = cabinet.id === state.activeCabinetId ? "cabinet-item-btn active" : "cabinet-item-btn";
      const tag = cabinet.platform === "ozon" ? "Ozon" : "WB";
      html += `<div class="cabinet-item-row">
        <button type="button" class="${cls}" data-cabinet-id="${escapeHtml(cabinet.id)}">${escapeHtml(cabinet.name)} (${tag})</button>
        <div class="cabinet-item-actions">
          <button type="button" class="cabinet-rename-btn ghost" data-cabinet-rename="${escapeHtml(cabinet.id)}">Переименовать</button>
          <button type="button" class="cabinet-delete-btn ghost" data-cabinet-delete="${escapeHtml(cabinet.id)}">Удалить</button>
        </div>
      </div>`;
    });
    el.cabinetSwitcherList.innerHTML = html || `<div class="empty">Нет кабинетов</div>`;
  }

  function addCabinet(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    const platformRaw = prompt("Платформа кабинета: wb или ozon", "wb");
    const platform = String(platformRaw || "wb").trim().toLowerCase() === "ozon" ? "ozon" : "wb";
    let ozonClientId = "";
    let ozonApiKey = "";
    if (platform === "ozon") {
      ozonClientId = String(prompt("Ozon Client ID", "") || "").trim();
      ozonApiKey = String(prompt("Ozon API Key", "") || "").trim();
    }
    const id = `cabinet-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    state.cabinets.push({ id, name: trimmed, platform, ozonClientId, ozonApiKey });
    state.activeCabinetId = id;
    persistCabinetsForCurrentUser();
    renderCabinetSwitcher();
    applyCabinetContext();
  }

  function switchCabinet(cabinetId) {
    if (!cabinetId || cabinetId === state.activeCabinetId) return;
    if (!state.cabinets.some((c) => c.id === cabinetId)) return;
    state.activeCabinetId = cabinetId;
    persistCabinetsForCurrentUser();
    renderCabinetSwitcher();
    applyCabinetContext();
  }

  function renameCabinet(cabinetId, nextName) {
    const trimmed = String(nextName || "").trim();
    if (!cabinetId || !trimmed) return;
    const cabinet = state.cabinets.find((c) => c.id === cabinetId);
    if (!cabinet) return;
    cabinet.name = trimmed;
    persistCabinetsForCurrentUser();
    renderCabinetSwitcher();
  }

  function deleteCabinet(cabinetId) {
    if (!cabinetId) return;
    if (state.cabinets.length <= 1) {
      alert("Нельзя удалить последний кабинет.");
      return;
    }
    const idx = state.cabinets.findIndex((c) => c.id === cabinetId);
    if (idx < 0) return;
    state.cabinets.splice(idx, 1);
    if (state.activeCabinetId === cabinetId) {
      state.activeCabinetId = state.cabinets[0]?.id || "cabinet-1";
    }
    persistCabinetsForCurrentUser();
    renderCabinetSwitcher();
    applyCabinetContext();
  }

  function applyCabinetContext() {
    try {
      state.expandedAnalyticsSkus.clear();
      state.expandedAnalyticsWarehouses.clear();
      restoreUserApiToken();
      restoreUserSettingsForCurrentUser();
      restoreDataCacheForCurrentUser();
    } catch (err) {
      console.error("applyCabinetContext data restore error:", err);
      state.originalData = [];
      state.processedData = [];
    }
    syncApiFieldsFromActiveCabinet();
    updateApiTabByCabinetPlatform();
    maybeRefreshDataOnStart();
  }

  function getActiveCabinet() {
    return state.cabinets.find((c) => c.id === state.activeCabinetId) || state.cabinets[0] || null;
  }

  function syncApiFieldsFromActiveCabinet() {
    const active = getActiveCabinet();
    if (!active) return;
    if (active.platform === "ozon") {
      if (el.ozonClientIdInput) el.ozonClientIdInput.value = active.ozonClientId || "";
      if (el.ozonApiKeyInput) el.ozonApiKeyInput.value = active.ozonApiKey || "";
      if (el.apiTokenInput) el.apiTokenInput.value = "";
      return;
    }
    restoreUserApiToken();
  }

  function updateApiTabByCabinetPlatform() {
    const active = getActiveCabinet();
    const isOzon = active?.platform === "ozon";
    el.wbTokenField?.classList.toggle("hidden", isOzon);
    // Для Ozon скрываем API-поля — Ozon работает только через отчёты
    el.ozonClientIdField?.classList.toggle("hidden", true);
    el.ozonApiKeyField?.classList.toggle("hidden", true);
    if (el.apiTestBtn) el.apiTestBtn.style.display = isOzon ? "none" : "";
    if (el.apiLoadStocksBtn) {
      el.apiLoadStocksBtn.disabled = false;
      el.apiLoadStocksBtn.style.display = isOzon ? "none" : "";
      el.apiLoadStocksBtn.textContent = "Загрузить остатки";
    }
    // Показываем кнопки загрузки файлов только для Ozon
    const stocksLabel = el.ozonStocksXlsxInput?.closest("label.upload-side");
    if (stocksLabel) stocksLabel.style.display = isOzon ? "" : "none";
    const ordersLabel = el.ozonOrdersCsvInput?.closest("label.upload-side");
    if (ordersLabel) ordersLabel.style.display = isOzon ? "" : "none";
    // Обновляем подсказку
    const hintEl = el.settingsApiTab?.querySelector("p.hint");
    if (hintEl) {
      hintEl.textContent = isOzon
        ? "Ozon работает через отчёты. Загрузите XLSX (остатки) и CSV (заказы)."
        : "Токен хранится локально для текущего пользователя. Используются только GET-запросы.";
    }
    updateClearOzonCsvBtnVisibility();
  }

  function getSession() {
    return sessionStorage.getItem(AUTH_SESSION_KEY) || "";
  }

  function setSession(usernameKey) {
    sessionStorage.setItem(AUTH_SESSION_KEY, usernameKey);
  }

  function clearSession() {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  }

  function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
  }

  function randomSalt() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function fetchBackendJson(url, options = {}) {
    const fullUrl = resolveBackendUrl(url);
    try {
      const resp = await fetch(fullUrl, options);
      let data = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }
      return { available: true, ok: resp.ok, status: resp.status, data };
    } catch {
      return { available: false, ok: false, status: 0, data: null };
    }
  }

  function resolveBackendUrl(urlPath) {
    const pathValue = String(urlPath || "");
    if (/^https?:\/\//i.test(pathValue)) return pathValue;
    if (location.protocol === "file:") {
      return `http://127.0.0.1:5500${pathValue.startsWith("/") ? pathValue : `/${pathValue}`}`;
    }
    return pathValue;
  }

  async function backendUserExists(usernameKey) {
    if (!usernameKey) return false;
    const res = await fetchBackendJson(`/api/auth/exists?username=${encodeURIComponent(usernameKey)}`);
    return !!(res.available && res.ok && res.data?.exists);
  }

  async function backendLogin(username, password) {
    const res = await fetchBackendJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return {
      available: res.available,
      ok: !!(res.available && res.ok && res.data?.ok),
      error: res.data?.error || "",
      usernameKey: res.data?.usernameKey || normalizeUsername(username),
    };
  }

  async function backendRegister(username, password) {
    const res = await fetchBackendJson("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return {
      available: res.available,
      ok: !!(res.available && res.ok && res.data?.ok),
      error: res.data?.error || "",
      usernameKey: res.data?.usernameKey || normalizeUsername(username),
    };
  }

  async function backendPutUserData(key, value) {
    if (!state.currentUserKey) return;
    await fetchBackendJson("/api/user-data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: state.currentUserKey, key, value }),
    });
  }

  function syncRemoteUserData(key, value) {
    if (!state.currentUserKey) return;
    void backendPutUserData(key, value);
  }

  async function syncPushAllData() {
    if (!state.currentUserKey) {
      alert("Сначала войдите в профиль.");
      return;
    }
    const scopeKey = getScopedProfileKey();
    if (!scopeKey) return;
    if (el.syncPushBtn) { el.syncPushBtn.disabled = true; el.syncPushBtn.textContent = "Синхронизация..."; }
    if (el.syncStatus) { el.syncStatus.style.display = "inline"; el.syncStatus.textContent = "Создание резервной копии..."; }
    try {
      // Сначала создаём резервную копию текущих данных на сервере
      await fetchBackendJson("/api/user-data/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: state.currentUserKey, name: `Авто (${new Date().toLocaleString()})` }),
      });
      if (el.syncStatus) el.syncStatus.textContent = "Отправка данных на сервер...";
      const pairs = [];
      // API-токен
      const tokenMap = getUserTokenMap();
      if (tokenMap[scopeKey]) pairs.push([`${REMOTE_KEY_API_TOKEN}:${scopeKey}`, tokenMap[scopeKey]]);
      // Кэш данных (остатки/заказы)
      const dataMap = getDataCacheMap();
      if (dataMap[scopeKey]) pairs.push([`${REMOTE_KEY_DATA_CACHE}:${scopeKey}`, dataMap[scopeKey]]);
      // Кэш названий товаров
      const namesMap = getProductNameCacheMap();
      if (namesMap[scopeKey]) pairs.push([`${REMOTE_KEY_PRODUCT_NAMES}:${scopeKey}`, namesMap[scopeKey]]);
      // Настройки пользователя
      const settingsMap = getUserSettingsMap();
      if (settingsMap[scopeKey]) pairs.push([`${REMOTE_KEY_USER_SETTINGS}:${scopeKey}`, settingsMap[scopeKey]]);
      // Кабинеты
      const cabMap = getUserCabinetsMap();
      if (cabMap[state.currentUserKey]) pairs.push([REMOTE_KEY_CABINETS, cabMap[state.currentUserKey]]);

      // Синхронизируем для ВСЕХ кабинетов текущего пользователя
      const cabs = (cabMap[state.currentUserKey]?.cabinets) || [];
      for (const cab of cabs) {
        const sk = `${state.currentUserKey}__${cab.id}`;
        if (sk === scopeKey) continue; // уже добавлено выше
        if (tokenMap[sk]) pairs.push([`${REMOTE_KEY_API_TOKEN}:${sk}`, tokenMap[sk]]);
        if (dataMap[sk]) pairs.push([`${REMOTE_KEY_DATA_CACHE}:${sk}`, dataMap[sk]]);
        if (namesMap[sk]) pairs.push([`${REMOTE_KEY_PRODUCT_NAMES}:${sk}`, namesMap[sk]]);
        if (settingsMap[sk]) pairs.push([`${REMOTE_KEY_USER_SETTINGS}:${sk}`, settingsMap[sk]]);
      }

      const res = await fetchBackendJson("/api/user-data/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: state.currentUserKey, pairs }),
      });
      if (res.available && res.ok && res.data?.ok) {
        if (el.syncStatus) { el.syncStatus.textContent = `Синхронизировано (${new Date().toLocaleTimeString()})`; }
      } else {
        // Фоллбэк: отправляем по одному
        let ok = 0;
        for (const [k, v] of pairs) {
          try { await backendPutUserData(k, v); ok++; } catch {}
        }
        if (el.syncStatus) { el.syncStatus.textContent = ok === pairs.length ? `Синхронизировано (${new Date().toLocaleTimeString()})` : `Частично: ${ok}/${pairs.length}`; }
      }
      loadBackupsList();
    } catch (err) {
      console.error("syncPushAllData error:", err);
      if (el.syncStatus) { el.syncStatus.textContent = "Ошибка синхронизации"; }
    } finally {
      if (el.syncPushBtn) { el.syncPushBtn.disabled = false; el.syncPushBtn.textContent = "Синхронизировать"; }
    }
  }

  async function loadBackupsList() {
    if (!state.currentUserKey) return;
    const res = await fetchBackendJson(`/api/user-data/backups?username=${encodeURIComponent(state.currentUserKey)}`);
    if (!(res.available && res.ok && res.data?.ok)) return;
    const backups = res.data.backups || [];
    const container = el.backupsList;
    if (!container) return;
    if (!backups.length) { container.innerHTML = "<span class='hint'>Нет резервных копий</span>"; return; }
    container.innerHTML = backups.map((b) => {
      const dt = new Date(b.createdAt + "Z").toLocaleString();
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span class="hint" style="flex:1;">${b.name} — ${dt}</span>
        <button class="ghost" data-restore-id="${b.id}" type="button" style="min-height:32px;padding:4px 10px;font-size:12px;">Восстановить</button>
      </div>`;
    }).join("");
    container.querySelectorAll("[data-restore-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Восстановить эту резервную копию? Текущие данные на сервере будут заменены.")) return;
        btn.disabled = true;
        btn.textContent = "...";
        const restoreRes = await fetchBackendJson("/api/user-data/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: state.currentUserKey, backupId: Number(btn.dataset.restoreId) }),
        });
        if (restoreRes.available && restoreRes.ok && restoreRes.data?.ok) {
          alert("Резервная копия восстановлена. Перезагрузите страницу для применения.");
          location.reload();
        } else {
          alert("Ошибка восстановления.");
          btn.disabled = false;
          btn.textContent = "Восстановить";
        }
      });
    });
  }

  async function createManualBackup() {
    if (!state.currentUserKey) return;
    if (el.backupCreateBtn) { el.backupCreateBtn.disabled = true; el.backupCreateBtn.textContent = "Создание..."; }
    const name = `Ручная (${new Date().toLocaleString()})`;
    const res = await fetchBackendJson("/api/user-data/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: state.currentUserKey, name }),
    });
    if (res.available && res.ok && res.data?.ok) {
      await loadBackupsList();
    } else {
      alert("Ошибка создания резервной копии.");
    }
    if (el.backupCreateBtn) { el.backupCreateBtn.disabled = false; el.backupCreateBtn.textContent = "Создать резервную копию"; }
  }

  function safeLocalStorageSet(key, value) {
    try {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn("localStorage write failed (quota?):", key, e);
      return false;
    }
  }

  async function hydrateUserScopedDataFromBackend() {
    if (!state.currentUserKey) return;
    try {
      const res = await fetchBackendJson(`/api/user-data/all?username=${encodeURIComponent(state.currentUserKey)}`);
      if (!(res.available && res.ok && res.data?.ok)) return;
      const data = res.data?.data || {};
      const scopeKey = getScopedProfileKey();
      if (!scopeKey) return;

      // Восстанавливаем данные только для АКТИВНОГО кабинета (экономим localStorage)
      const scopedApiTokenKey = `${REMOTE_KEY_API_TOKEN}:${scopeKey}`;
      const scopedDataCacheKey = `${REMOTE_KEY_DATA_CACHE}:${scopeKey}`;
      const scopedProductNamesKey = `${REMOTE_KEY_PRODUCT_NAMES}:${scopeKey}`;
      const scopedUserSettingsKey = `${REMOTE_KEY_USER_SETTINGS}:${scopeKey}`;

      // API-токен
      const remoteToken = data[scopedApiTokenKey] ?? data[REMOTE_KEY_API_TOKEN] ?? null;
      if (remoteToken != null) {
        const map = getUserTokenMap();
        map[scopeKey] = String(remoteToken);
        safeLocalStorageSet(API_TOKEN_MAP_KEY, map);
      }
      // Настройки пользователя (маленькие, безопасно)
      const remoteSettings = data[scopedUserSettingsKey] ?? data[REMOTE_KEY_USER_SETTINGS] ?? null;
      if (remoteSettings != null) {
        const map = getUserSettingsMap();
        map[scopeKey] = remoteSettings;
        safeLocalStorageSet(USER_SETTINGS_MAP_KEY, map);
      }
      // Названия товаров
      const remoteNames = data[scopedProductNamesKey] ?? data[REMOTE_KEY_PRODUCT_NAMES] ?? null;
      if (remoteNames != null) {
        const map = getProductNameCacheMap();
        map[scopeKey] = remoteNames;
        safeLocalStorageSet(PRODUCT_NAME_CACHE_MAP_KEY, map);
      }
      // Кэш данных — самый тяжёлый, пишем последним
      const remoteData = data[scopedDataCacheKey] ?? data[REMOTE_KEY_DATA_CACHE] ?? null;
      if (remoteData != null && typeof remoteData === "object") {
        const localMap = getDataCacheMap();
        const localSaved = localMap[scopeKey];
        const localUpdatedAt = localSaved?.updatedAt || 0;
        const remoteUpdatedAt = remoteData.updatedAt || 0;
        // Берём с сервера если данные свежее или локальных нет
        if (remoteUpdatedAt >= localUpdatedAt || !localSaved || !Array.isArray(localSaved.originalData)) {
          localMap[scopeKey] = remoteData;
          if (!safeLocalStorageSet(DATA_CACHE_MAP_KEY, localMap)) {
            // Квота — пробуем без dailyOrdersBySku
            const slim = { ...remoteData, dailyOrdersBySku: {} };
            localMap[scopeKey] = slim;
            safeLocalStorageSet(DATA_CACHE_MAP_KEY, localMap);
          }
        }
      }

      // Кабинеты (мержим)
      if (Object.prototype.hasOwnProperty.call(data, REMOTE_KEY_CABINETS)) {
        const remoteCabinets = data[REMOTE_KEY_CABINETS];
        if (remoteCabinets && Array.isArray(remoteCabinets.cabinets) && remoteCabinets.cabinets.length) {
          const localMap = getUserCabinetsMap();
          const localSaved = localMap[state.currentUserKey];
          const localCabs = (localSaved && Array.isArray(localSaved.cabinets)) ? localSaved.cabinets : [];
          const localIds = new Set(localCabs.map((c) => c.id));
          const merged = [...localCabs];
          remoteCabinets.cabinets.forEach((rc) => {
            if (rc.id && rc.name && !localIds.has(rc.id)) {
              merged.push({
                id: String(rc.id),
                name: String(rc.name),
                platform: String(rc.platform || "wb"),
                ozonClientId: String(rc.ozonClientId || ""),
                ozonApiKey: String(rc.ozonApiKey || ""),
              });
            }
          });
          if (merged.length > localCabs.length) {
            localMap[state.currentUserKey] = {
              activeCabinetId: localSaved?.activeCabinetId || remoteCabinets.activeCabinetId || merged[0]?.id,
              cabinets: merged,
              updatedAt: Date.now(),
            };
            safeLocalStorageSet(USER_CABINETS_MAP_KEY, localMap);
            loadCabinetsForCurrentUser();
            renderCabinetSwitcher();
          }
        }
      }
    } catch (err) {
      console.error("hydrateUserScopedDataFromBackend error:", err);
    }
  }

  async function migrateProfileToServer() {
    if (!state.currentUserKey) {
      alert("Сначала войдите в профиль.");
      return;
    }
    const users = getUsers();
    const user = users.find((u) => u.usernameKey === state.currentUserKey);
    if (!user) {
      alert("Локальный профиль не найден для миграции.");
      return;
    }
    if (el.migrateProfileBtn) {
      el.migrateProfileBtn.disabled = true;
      el.migrateProfileBtn.textContent = "Перенос...";
    }
    try {
      const tokenMap = getUserTokenMap();
      const settingsMap = getUserSettingsMap();
      const cabinetsMap = getUserCabinetsMap();

      const payload = {
        user: {
          username: user.username,
          usernameKey: user.usernameKey,
          salt: user.salt,
          passwordHash: user.passwordHash,
        },
        userData: {
          [REMOTE_KEY_API_TOKEN]: tokenMap[state.currentUserKey] || "",
          [REMOTE_KEY_USER_SETTINGS]: settingsMap[state.currentUserKey] || {},
          [REMOTE_KEY_CABINETS]: cabinetsMap[state.currentUserKey] || {},
        },
      };

      const res = await fetchBackendJson("/api/migrate/local-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!(res.available && res.ok && res.data?.ok)) {
        throw new Error(res.data?.error || "server_unavailable_or_blocked");
      }
      alert("Профиль перенесен: аккаунт, токен и настройки сохранены в серверной базе.");
    } catch (error) {
      alert(`Не удалось перенести профиль: ${error.message || error}\n\nПроверьте, что сервер запущен: python server.py`);
    } finally {
      if (el.migrateProfileBtn) {
        el.migrateProfileBtn.disabled = false;
        el.migrateProfileBtn.textContent = "Перенести профиль в сервер";
      }
    }
  }

  function getUserTokenMap() {
    try {
      const raw = localStorage.getItem(API_TOKEN_MAP_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveUserTokenMap(map) {
    localStorage.setItem(API_TOKEN_MAP_KEY, JSON.stringify(map));
    const scopeKey = getScopedProfileKey();
    if (scopeKey && map && Object.prototype.hasOwnProperty.call(map, scopeKey)) {
      syncRemoteUserData(`${REMOTE_KEY_API_TOKEN}:${scopeKey}`, map[scopeKey] || "");
    }
  }

  function getSavedApiTokenForCurrentUser() {
    const scopeKey = getScopedProfileKey();
    if (!scopeKey) return "";
    const map = getUserTokenMap();
    if (Object.prototype.hasOwnProperty.call(map, scopeKey)) return String(map[scopeKey] || "");
    if (state.activeCabinetId === "cabinet-1" && Object.prototype.hasOwnProperty.call(map, state.currentUserKey)) {
      return String(map[state.currentUserKey] || "");
    }
    return "";
  }

  function setSavedApiTokenForCurrentUser(token) {
    const scopeKey = getScopedProfileKey();
    if (!scopeKey) return;
    const map = getUserTokenMap();
    map[scopeKey] = token;
    saveUserTokenMap(map);
  }

  function restoreUserApiToken() {
    const active = getActiveCabinet();
    if (active?.platform === "ozon") return;
    const token = getSavedApiTokenForCurrentUser();
    if (el.apiTokenInput) el.apiTokenInput.value = token || "";
  }

  function getUserSettingsMap() {
    try {
      const raw = localStorage.getItem(USER_SETTINGS_MAP_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveUserSettingsMap(map) {
    localStorage.setItem(USER_SETTINGS_MAP_KEY, JSON.stringify(map));
    const scopeKey = getScopedProfileKey();
    if (scopeKey && map && Object.prototype.hasOwnProperty.call(map, scopeKey)) {
      syncRemoteUserData(`${REMOTE_KEY_USER_SETTINGS}:${scopeKey}`, map[scopeKey] || {});
    }
  }

  function persistUserSettingsForCurrentUser() {
    const scopeKey = getScopedProfileKey();
    if (!scopeKey) return;
    const map = getUserSettingsMap();
    map[scopeKey] = {
      excludedSkus: Array.from(state.excludedSkus),
      useOnlySkuList: !!state.useOnlySkuList,
      salesPlanMap: state.salesPlanMap || {},
      calcMode: state.calcMode || "demand",
      turnoverDays: toNum(state.turnoverDays, 45),
      lowStockDays: toNum(state.lowStockDays, 20),
      overstockDays: toNum(state.overstockDays, 45),
      selectedCalcWarehouses: Array.isArray(state.selectedCalcWarehouses) ? state.selectedCalcWarehouses : [],
      warehouseShareMap: state.warehouseShareMap || {},
      warehouseSelectionTouched: !!state.warehouseSelectionTouched,
      autoWarehouseShare: !!state.autoWarehouseShare,
      updatedAt: Date.now(),
    };
    saveUserSettingsMap(map);
  }

  function restoreUserSettingsForCurrentUser() {
    const scopeKey = getScopedProfileKey();
    if (!scopeKey) return;
    const map = getUserSettingsMap();
    const fallbackSettings =
      state.activeCabinetId === "cabinet-1" && Object.prototype.hasOwnProperty.call(map, state.currentUserKey)
        ? map[state.currentUserKey]
        : {};
    const settings = map[scopeKey] || fallbackSettings || {};

    const skuList = Array.isArray(settings.excludedSkus) ? settings.excludedSkus.map((x) => String(x || "").trim()).filter(Boolean) : [];
    state.excludedSkus = new Set(skuList);
    state.useOnlySkuList = !!settings.useOnlySkuList;
    state.salesPlanMap = settings.salesPlanMap && typeof settings.salesPlanMap === "object" ? settings.salesPlanMap : {};
    state.calcMode = settings.calcMode === "plan_max" ? "plan_max" : "demand";
    state.turnoverDays = Math.max(1, toNum(settings.turnoverDays, 45));
    state.lowStockDays = Math.max(1, toNum(settings.lowStockDays, 20));
    state.overstockDays = Math.max(1, toNum(settings.overstockDays, 45));
    state.selectedCalcWarehouses = Array.isArray(settings.selectedCalcWarehouses)
      ? settings.selectedCalcWarehouses.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    state.warehouseShareMap = settings.warehouseShareMap && typeof settings.warehouseShareMap === "object" ? settings.warehouseShareMap : {};
    state.warehouseSelectionTouched = !!settings.warehouseSelectionTouched;
    if (!state.selectedCalcWarehouses.length) state.warehouseSelectionTouched = false;
    state.autoWarehouseShare = !!settings.autoWarehouseShare;

    if (el.settingsSkuList) el.settingsSkuList.value = skuList.join("\n");
    if (el.settingsUseOnlySkuList) el.settingsUseOnlySkuList.checked = state.useOnlySkuList;
    if (el.calcDemandMode) el.calcDemandMode.value = state.calcMode;
    if (el.turnoverDays) el.turnoverDays.value = String(state.turnoverDays);
    if (el.lowStockDays) el.lowStockDays.value = String(state.lowStockDays);
    if (el.overstockDays) el.overstockDays.value = String(state.overstockDays);
    if (el.autoWarehouseShare) el.autoWarehouseShare.checked = state.autoWarehouseShare;
    renderSalesPlanStatus();
  }

  function startApiAutoRefresh() {
    if (state.apiAutoRefreshTimer) clearInterval(state.apiAutoRefreshTimer);
    state.apiAutoRefreshTimer = setInterval(() => {
      if (!state.currentUserKey) return;
      const token = getSavedApiTokenForCurrentUser();
      if (!token) return;
      loadStocksFromApi({ silent: true, skipCooldown: true, auto: true });
    }, API_REFRESH_MS);
  }

  function getDataCacheMap() {
    try {
      const raw = localStorage.getItem(DATA_CACHE_MAP_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveDataCacheMap(map) {
    localStorage.setItem(DATA_CACHE_MAP_KEY, JSON.stringify(map));
    const scopeKey = getScopedProfileKey();
    if (scopeKey && map && Object.prototype.hasOwnProperty.call(map, scopeKey)) {
      syncRemoteUserData(`${REMOTE_KEY_DATA_CACHE}:${scopeKey}`, map[scopeKey] || {});
    }
  }

  function getProductNameCacheMap() {
    try {
      const raw = localStorage.getItem(PRODUCT_NAME_CACHE_MAP_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveProductNameCacheMap(map) {
    localStorage.setItem(PRODUCT_NAME_CACHE_MAP_KEY, JSON.stringify(map));
    const scopeKey = getScopedProfileKey();
    if (scopeKey && map && Object.prototype.hasOwnProperty.call(map, scopeKey)) {
      syncRemoteUserData(`${REMOTE_KEY_PRODUCT_NAMES}:${scopeKey}`, map[scopeKey] || {});
    }
  }

  function getProductNameCacheForCurrentUser() {
    const scopeKey = getScopedProfileKey();
    if (!scopeKey) return {};
    const fullMap = getProductNameCacheMap();
    const userMap =
      fullMap[scopeKey] ||
      (state.activeCabinetId === "cabinet-1" && Object.prototype.hasOwnProperty.call(fullMap, state.currentUserKey)
        ? fullMap[state.currentUserKey]
        : null);
    return userMap && typeof userMap === "object" ? userMap : {};
  }

  function saveProductNameCacheForCurrentUser(userMap) {
    const scopeKey = getScopedProfileKey();
    if (!scopeKey || !userMap || typeof userMap !== "object") return;
    const fullMap = getProductNameCacheMap();
    fullMap[scopeKey] = userMap;
    saveProductNameCacheMap(fullMap);
  }

  function persistDataCacheForCurrentUser() {
    const scopeKey = getScopedProfileKey();
    if (!scopeKey || !state.originalData.length) return;
    const map = getDataCacheMap();
    map[scopeKey] = {
      originalData: state.originalData,
      inTransitMap: state.inTransitMap,
      daysInReport: state.daysInReport,
      dailyOrdersBySku: state.dailyOrdersBySku,
      ozonOrdersCsvAgg: state.ozonOrdersCsvAgg || null,
      updatedAt: Date.now(),
    };
    try {
      saveDataCacheMap(map);
    } catch (e) {
      // Квота localStorage превышена — пробуем сохранить без dailyOrdersBySku (самое тяжёлое)
      try {
        map[scopeKey].dailyOrdersBySku = {};
        saveDataCacheMap(map);
      } catch (e2) {
        // Совсем нет места — чистим старые кэши других кабинетов и пробуем снова
        try {
          const cleanMap = {};
          cleanMap[scopeKey] = map[scopeKey];
          localStorage.setItem(DATA_CACHE_MAP_KEY, JSON.stringify(cleanMap));
        } catch (e3) {
          console.warn("localStorage quota exceeded, cache not saved:", e3);
        }
      }
    }
    state.lastDataUpdateAt = map[scopeKey]?.updatedAt || Date.now();
  }

  function restoreDataCacheForCurrentUser() {
    const scopeKey = getScopedProfileKey();
    if (!scopeKey) return;
    const map = getDataCacheMap();
    const fallbackSaved =
      state.activeCabinetId === "cabinet-1" && Object.prototype.hasOwnProperty.call(map, state.currentUserKey)
        ? map[state.currentUserKey]
        : null;
    const saved = map[scopeKey] || fallbackSaved;
    if (!saved || !Array.isArray(saved.originalData)) {
      state.originalData = [];
      state.processedData = [];
      state.shipmentResultData = [];
      state.abcResultData = [];
      state.redistributionData = [];
      state.dailyOrdersBySku = {};
      state.ozonOrdersCsvAgg = null;
      state.lastDataUpdateAt = 0;
      if (el.status) el.status.textContent = "Данные не загружены для этого кабинета";
      renderAll();
      return;
    }
    state.originalData = saved.originalData;
    state.inTransitMap = saved.inTransitMap && typeof saved.inTransitMap === "object" ? saved.inTransitMap : {};
    state.daysInReport = Math.max(1, toNum(saved.daysInReport, 30));
    state.dailyOrdersBySku = saved.dailyOrdersBySku && typeof saved.dailyOrdersBySku === "object" ? saved.dailyOrdersBySku : {};
    state.ozonOrdersCsvAgg = (saved.ozonOrdersCsvAgg && typeof saved.ozonOrdersCsvAgg === "object") ? saved.ozonOrdersCsvAgg : null;
    state.lastDataUpdateAt = toNum(saved.updatedAt, 0);
    // Если были сохранены агрегированные CSV-заказы Ozon — переприменяем их
    if (state.ozonOrdersCsvAgg) {
      applyOzonOrdersCsvAgg(state.ozonOrdersCsvAgg);
    }
    processData();
    runShipmentAnalysis();
    runAbcAnalysis();
    runRedistributionAnalysis();
    updateClearOzonCsvBtnVisibility();
    if (el.status) {
      const dt = state.lastDataUpdateAt ? new Date(state.lastDataUpdateAt).toLocaleString() : "неизвестно";
      const csvNote = state.ozonOrdersCsvAgg ? " + CSV заказы" : "";
      el.status.textContent = `Данные восстановлены из кэша (${dt})${csvNote}`;
    }
  }

  function maybeRefreshDataOnStart() {
    const token = (el.apiTokenInput?.value || getSavedApiTokenForCurrentUser() || "").trim();
    if (!token) return;
    const now = Date.now();
    const stale = !state.lastDataUpdateAt || now - state.lastDataUpdateAt >= API_REFRESH_MS;
    if (stale) {
      loadStocksFromApi({ silent: true, skipCooldown: true, auto: true });
    }
  }

  function getScopedProfileKey() {
    if (!state.currentUserKey) return "";
    return `${state.currentUserKey}::${state.activeCabinetId || "cabinet-1"}`;
  }

  function bindEvents() {
    el.mainFileInput?.addEventListener("change", onMainFileUpload);
    el.shipmentFileInput?.addEventListener("change", onShipmentFilesUpload);
    el.searchInput?.addEventListener("input", renderAll);
    el.warehouseFilter?.addEventListener("change", renderAll);
    el.combineMsk?.addEventListener("change", () => {
      if (el.combineMsk.checked) el.excludeMsk.checked = false;
      processData();
    });
    el.excludeMsk?.addEventListener("change", () => {
      if (el.excludeMsk.checked) el.combineMsk.checked = false;
      processData();
    });
    el.showOnlyRisk?.addEventListener("change", renderAll);
    el.hideOverstockTurnover?.addEventListener("change", () => { runShipmentAnalysis(); });
    el.turnoverDays?.addEventListener("change", () => {
      state.turnoverDays = Math.max(1, toNum(el.turnoverDays.value, 45));
      persistUserSettingsForCurrentUser();
      runShipmentAnalysis();
    });
    el.calcDemandMode?.addEventListener("change", () => {
      state.calcMode = el.calcDemandMode.value === "plan_max" ? "plan_max" : "demand";
      persistUserSettingsForCurrentUser();
      runShipmentAnalysis();
    });
    el.calcWarehousesDropdownBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      el.calcWarehousesDropdown?.classList.toggle("hidden");
      if (!el.calcWarehousesDropdown?.classList.contains("hidden")) {
        el.calcWarehousesSearch?.focus();
      }
    });
    el.calcWarehousesSearch?.addEventListener("input", () => renderCalcWarehousesChecklist());
    el.calcWarehousesChecklist?.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
      syncSelectedCalcWarehousesFromChecklist();
      state.warehouseSelectionTouched = true;
      ensureWarehouseShareMap();
      persistUserSettingsForCurrentUser();
      runShipmentAnalysis();
      renderWarehouseShareGrid();
      updateCalcWarehousesDropdownButton();
    });
    el.calcWarehousesSelectAllBtn?.addEventListener("click", () => {
      state.selectedCalcWarehouses = [...(state.availableCalcWarehouses || [])];
      state.warehouseSelectionTouched = true;
      renderCalcWarehousesChecklist();
      ensureWarehouseShareMap();
      persistUserSettingsForCurrentUser();
      runShipmentAnalysis();
      renderWarehouseShareGrid();
      updateCalcWarehousesDropdownButton();
    });
    el.calcWarehousesResetBtn?.addEventListener("click", () => {
      state.selectedCalcWarehouses = [];
      state.warehouseSelectionTouched = true;
      renderCalcWarehousesChecklist();
      ensureWarehouseShareMap();
      persistUserSettingsForCurrentUser();
      runShipmentAnalysis();
      renderWarehouseShareGrid();
      updateCalcWarehousesDropdownButton();
    });
    el.warehouseShareGrid?.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (state.autoWarehouseShare) return;
      const warehouse = String(target.dataset.warehouse || "");
      if (!warehouse) return;
      const pct = clamp(toNum(target.value, 0), 0, 100);
      state.warehouseShareMap[warehouse] = pct;
      persistUserSettingsForCurrentUser();
      runShipmentAnalysis();
    });
    el.autoWarehouseShare?.addEventListener("change", () => {
      state.autoWarehouseShare = !!el.autoWarehouseShare.checked;
      ensureWarehouseShareMap();
      persistUserSettingsForCurrentUser();
      renderWarehouseShareGrid();
      runShipmentAnalysis();
    });
    el.lowStockDays?.addEventListener("input", () => {
      state.lowStockDays = Math.max(1, toNum(el.lowStockDays.value, 20));
      persistUserSettingsForCurrentUser();
      renderAll();
    });
    el.overstockDays?.addEventListener("input", () => {
      state.overstockDays = Math.max(1, toNum(el.overstockDays.value, 45));
      persistUserSettingsForCurrentUser();
      renderAll();
    });
    el.settingsSkuList?.addEventListener("input", () => {
      applySkuListSettingsFromControls();
    });
    el.settingsUseOnlySkuList?.addEventListener("change", () => {
      applySkuListSettingsFromControls();
    });
    el.settingsSalesPlanInput?.addEventListener("change", handleSalesPlanUpload);
    el.ozonClientIdInput?.addEventListener("input", () => {
      const active = getActiveCabinet();
      if (!active || active.platform !== "ozon") return;
      active.ozonClientId = String(el.ozonClientIdInput.value || "").trim();
      persistCabinetsForCurrentUser();
    });
    el.ozonApiKeyInput?.addEventListener("input", () => {
      const active = getActiveCabinet();
      if (!active || active.platform !== "ozon") return;
      active.ozonApiKey = String(el.ozonApiKeyInput.value || "").trim();
      persistCabinetsForCurrentUser();
    });
    el.reportViewToggleBtn?.addEventListener("click", () => {
      state.showWarehouseDetails = !state.showWarehouseDetails;
      el.reportViewToggleBtn.textContent = state.showWarehouseDetails
        ? "Details by warehouse: ON"
        : "Details by warehouse: OFF";
      renderAll();
    });

    el.calculateShipmentBtn?.addEventListener("click", runShipmentAnalysis);
    el.calculateAbcBtn?.addEventListener("click", runAbcAnalysis);
    el.calculateRedistributionBtn?.addEventListener("click", runRedistributionAnalysis);
    el.downloadShipmentBtn?.addEventListener("click", () => exportShipment("xlsx"));

    el.exportCsvBtn?.addEventListener("click", () => exportShipment("csv"));
    el.exportXlsxBtn?.addEventListener("click", () => exportShipment("xlsx"));
    el.exportAllBtn?.addEventListener("click", () => exportShipment("xlsx"));
    el.importCsvInput?.addEventListener("change", importManualCsv);
    el.downloadTemplateBtn?.addEventListener("click", downloadTemplateCsv);
    el.recalcAllBtn?.addEventListener("click", () => {
      runShipmentAnalysis();
      runAbcAnalysis();
      runRedistributionAnalysis();
    });
    el.switchShipmentTabBtn?.addEventListener("click", () => activateTab("shipment"));
    el.apiTestBtn?.addEventListener("click", runApiTokenTest);
    el.apiLoadStocksBtn?.addEventListener("click", () => loadStocksFromApi({}));
    el.ozonStocksXlsxInput?.addEventListener("change", importOzonStocksXlsx);
    el.ozonOrdersCsvInput?.addEventListener("change", importOzonOrdersCsv);
    el.clearOzonCsvBtn?.addEventListener("click", clearOzonOrdersCsv);
    el.migrateProfileBtn?.addEventListener("click", migrateProfileToServer);
    el.syncPushBtn?.addEventListener("click", syncPushAllData);
    el.backupCreateBtn?.addEventListener("click", createManualBackup);
    el.goCalcBtn?.addEventListener("click", () => switchPage("calc"));
    el.navDashboardBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      switchPage("dashboard");
    });
    el.navAnalyticsBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // На touch-устройствах hover не работает — переключаем .open по клику
      const dropdown = el.navAnalyticsBtn.closest(".nav-dropdown");
      if (dropdown) {
        const isOpen = dropdown.classList.toggle("open");
        if (isOpen) return; // Первый тап — открыть меню, не переключать страницу
      }
      switchAnalyticsMode("stock");
      switchPage("analytics");
    });
    el.navAnalyticsStockBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      el.navAnalyticsBtn?.closest(".nav-dropdown")?.classList.remove("open");
      switchAnalyticsMode("stock");
      switchPage("analytics");
    });
    el.navAnalyticsWarehouseBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      el.navAnalyticsBtn?.closest(".nav-dropdown")?.classList.remove("open");
      switchAnalyticsMode("warehouse");
      switchPage("analytics");
    });
    el.navAnalyticsTurnoverBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      el.navAnalyticsBtn?.closest(".nav-dropdown")?.classList.remove("open");
      switchAnalyticsMode("turnover");
      switchPage("analytics");
    });
    el.navCalcBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      switchPage("calc");
    });
    el.analyticsSearchInput?.addEventListener("input", renderAll);
    el.analyticsCategoryFilter?.addEventListener("change", renderAll);
    el.analyticsSortSelect?.addEventListener("change", renderAll);
    el.analyticsWarehouseSearchInput?.addEventListener("input", renderAll);
    el.analyticsWarehouseSortSelect?.addEventListener("change", renderAll);
    el.analyticsReportTable?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest("[data-expand-sku]");
      if (!btn) return;
      const sku = String(btn.getAttribute("data-expand-sku") || "");
      if (!sku) return;
      if (state.expandedAnalyticsSkus.has(sku)) state.expandedAnalyticsSkus.delete(sku);
      else state.expandedAnalyticsSkus.add(sku);
      renderAll();
    });
    el.analyticsWarehouseTable?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest("[data-expand-warehouse]");
      if (!btn) return;
      const warehouse = String(btn.getAttribute("data-expand-warehouse") || "");
      if (!warehouse) return;
      if (state.expandedAnalyticsWarehouses.has(warehouse)) state.expandedAnalyticsWarehouses.delete(warehouse);
      else state.expandedAnalyticsWarehouses.add(warehouse);
      renderAll();
    });

    el.userMenuBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      el.userMenuDropdown?.classList.toggle("hidden");
    });
    el.openSettingsBtn?.addEventListener("click", () => {
      el.userMenuDropdown?.classList.add("hidden");
      el.settingsPanel?.classList.remove("hidden");
      switchSettingsTab("api");
      updateApiTabByCabinetPlatform();
      loadBackupsList();
    });
    el.closeSettingsBtn?.addEventListener("click", () => {
      el.settingsPanel?.classList.add("hidden");
    });
    el.cabinetSwitcherBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      el.cabinetSwitcherMenu?.classList.toggle("hidden");
    });
    el.cabinetSwitcherList?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const deleteBtn = target.closest("[data-cabinet-delete]");
      if (deleteBtn) {
        const cabinetId = String(deleteBtn.getAttribute("data-cabinet-delete") || "");
        const current = state.cabinets.find((c) => c.id === cabinetId);
        const ok = confirm(`Удалить кабинет "${current?.name || cabinetId}"?`);
        if (ok) deleteCabinet(cabinetId);
        return;
      }
      const renameBtn = target.closest("[data-cabinet-rename]");
      if (renameBtn) {
        const cabinetId = String(renameBtn.getAttribute("data-cabinet-rename") || "");
        const current = state.cabinets.find((c) => c.id === cabinetId);
        const nextName = prompt("Новое название кабинета", current?.name || "");
        if (nextName) renameCabinet(cabinetId, nextName);
        return;
      }
      const btn = target.closest("[data-cabinet-id]");
      if (!btn) return;
      const cabinetId = String(btn.getAttribute("data-cabinet-id") || "");
      if (!cabinetId) return;
      switchCabinet(cabinetId);
      el.cabinetSwitcherMenu?.classList.add("hidden");
    });
    el.cabinetAddBtn?.addEventListener("click", () => {
      const nextName = prompt("Название кабинета", `Кабинет ${state.cabinets.length + 1}`);
      if (!nextName) return;
      addCabinet(nextName);
      el.cabinetSwitcherMenu?.classList.add("hidden");
    });
    document.addEventListener("click", () => {
      el.userMenuDropdown?.classList.add("hidden");
      el.calcWarehousesDropdown?.classList.add("hidden");
      el.cabinetSwitcherMenu?.classList.add("hidden");
      document.querySelectorAll(".nav-dropdown.open").forEach((d) => d.classList.remove("open"));
    });
    el.calcWarehousesDropdownWrap?.addEventListener("click", (event) => event.stopPropagation());
    el.cabinetSwitcherWrap?.addEventListener("click", (event) => event.stopPropagation());
    el.settingsTabButtons?.forEach((btn) => {
      btn.addEventListener("click", () => switchSettingsTab(btn.dataset.settingsTab || "api"));
    });
  }

  function switchSettingsTab(tab) {
    el.settingsTabButtons?.forEach((btn) => btn.classList.toggle("active", btn.dataset.settingsTab === tab));
    el.settingsApiTab?.classList.toggle("active", tab === "api");
    el.settingsMarkersTab?.classList.toggle("active", tab === "markers");
    el.settingsFiltersPlanTab?.classList.toggle("active", tab === "filters-plan");
  }

  function initApiDate() {
    if (!el.apiDateFrom) return;
    const dt = new Date();
    dt.setDate(dt.getDate() - 30);
    el.apiDateFrom.value = dt.toISOString().slice(0, 10);
    if (el.lowStockDays) state.lowStockDays = Math.max(1, toNum(el.lowStockDays.value, 20));
    if (el.overstockDays) state.overstockDays = Math.max(1, toNum(el.overstockDays.value, 45));
    if (el.turnoverDays) el.turnoverDays.value = String(state.turnoverDays || 45);
    if (el.calcDemandMode) el.calcDemandMode.value = state.calcMode || "demand";
    if (el.reportViewToggleBtn) {
      el.reportViewToggleBtn.textContent = "Details by warehouse: OFF";
    }
  }

  function initTabs() {
    document.querySelectorAll(".tab[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => activateTab(btn.dataset.tab));
    });
  }

  function switchPage(page) {
    if (el.pageDashboard) el.pageDashboard.classList.toggle("hidden", page !== "dashboard");
    if (el.pageAnalytics) el.pageAnalytics.classList.toggle("hidden", page !== "analytics");
    if (el.pageCalc) el.pageCalc.classList.toggle("hidden", page !== "calc");
    if (page === "analytics") switchAnalyticsMode(state.analyticsMode || "stock");
  }

  function switchAnalyticsMode(mode) {
    state.analyticsMode = mode === "warehouse" || mode === "turnover" ? mode : "stock";
    el.analyticsStockSection?.classList.toggle("hidden", state.analyticsMode !== "stock");
    el.analyticsWarehouseSection?.classList.toggle("hidden", state.analyticsMode !== "warehouse");
    el.analyticsTurnoverSection?.classList.toggle("hidden", state.analyticsMode !== "turnover");
  }

  function activateTab(tabId) {
    document.querySelectorAll(".tab").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((tab) => tab.classList.remove("active"));
    q(`.tab[data-tab="${tabId}"]`).classList.add("active");
    q(`#${tabId}-tab`).classList.add("active");
  }

  async function onMainFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    el.status.textContent = "Читаю отчет...";
    try {
      const parsed = await parseSalesXlsx(file);
      state.originalData = parsed.rows;
      state.inTransitMap = {};
      state.dailyOrdersBySku = {};
      state.ozonOrdersCsvAgg = null;
      state.daysInReport = parsed.daysInReport;
      el.status.textContent = `Загружено ${state.originalData.length} строк, период ${state.daysInReport} дн.`;
      processData();
      runShipmentAnalysis();
      runAbcAnalysis();
      runRedistributionAnalysis();
      persistDataCacheForCurrentUser();
      updateClearOzonCsvBtnVisibility();
    } catch (error) {
      el.status.textContent = "Ошибка чтения отчета";
      alert(error.message);
    }
  }

  async function onShipmentFilesUpload(event) {
    const files = [...event.target.files];
    if (!files.length) return;
    el.shipmentStatus.textContent = `Обрабатываю файлов: ${files.length}...`;
    try {
      state.inTransitMap = {};
      for (const file of files) {
        const rows = await parseShipmentXlsx(file);
        rows.forEach((row) => {
          const key = `${row.barcode}__${row.warehouse}__${row.size}`;
          state.inTransitMap[key] = (state.inTransitMap[key] || 0) + row.quantity;
        });
      }
      const totalTransit = Object.values(state.inTransitMap).reduce((a, b) => a + b, 0);
      el.shipmentStatus.textContent = `В пути: ${totalTransit} шт. (${files.length} файлов)`;
      processData();
      runShipmentAnalysis();
      runAbcAnalysis();
      runRedistributionAnalysis();
      persistDataCacheForCurrentUser();
    } catch (error) {
      el.shipmentStatus.textContent = "Ошибка загрузки поставок";
      alert(error.message);
    }
  }

  function processData() {
    let data = structuredCloneSafe(state.originalData);
    if (!data.length) {
      state.processedData = [];
      renderAll();
      return;
    }

    data.forEach((row) => {
      const key = `${row.barcode}__${row.warehouse}__${row.size}`;
      const transitFromApi = Math.max(0, toNum(row.inTransit, 0));
      const transitFromFiles = state.inTransitMap[key] || 0;
      row.inTransit = transitFromApi + transitFromFiles;
      row.totalStock = row.stock + row.inTransit;
      row.buyoutPercent = row.ordered > 0 ? (row.bought / row.ordered) * 100 : 0;
      row.name = normalizeProductName(row.name, row.sku, row.nmId);
    });

    if (el.excludeMsk.checked) {
      data = data.filter((row) => !MSK_WAREHOUSES.includes(row.warehouse.toLowerCase()));
    } else if (el.combineMsk.checked) {
      data = combineMskRows(data);
    }

    data = applySkuScopeFilter(data);

    state.processedData = data;
    fillWarehouseFilter(data);
    populateCalcWarehousesControl(data);
    ensureWarehouseShareMap();
    renderWarehouseShareGrid();
    renderAll();
  }

  function applySkuScopeFilter(rows) {
    const skuSet = state.excludedSkus;
    if (!skuSet || !skuSet.size) return state.useOnlySkuList ? [] : rows;
    return rows.filter((row) => {
      const token = normalizeSkuToken(row.sku);
      if (!token) return !state.useOnlySkuList;
      return state.useOnlySkuList ? skuSet.has(token) : !skuSet.has(token);
    });
  }

  function combineMskRows(data) {
    const mskRows = data.filter((r) => MSK_WAREHOUSES.includes(r.warehouse.toLowerCase()));
    const nonMskRows = data.filter((r) => !MSK_WAREHOUSES.includes(r.warehouse.toLowerCase()));
    const grouped = {};
    mskRows.forEach((row) => {
      const key = `${row.barcode}__${row.size}`;
      if (!grouped[key]) {
        grouped[key] = {
          ...row,
          warehouse: "МСК (суммарно)",
          bought: 0,
          ordered: 0,
          stock: 0,
          inTransit: 0,
          totalStock: 0,
          revenue: 0,
        };
      }
      grouped[key].bought += row.bought;
      grouped[key].ordered += row.ordered;
      grouped[key].stock += row.stock;
      grouped[key].inTransit += row.inTransit || 0;
      grouped[key].totalStock += row.totalStock || row.stock;
      grouped[key].revenue += row.revenue;
    });
    return [...nonMskRows, ...Object.values(grouped)];
  }

  function fillWarehouseFilter(data) {
    const selected = el.warehouseFilter.value;
    const warehouses = [...new Set(data.map((r) => r.warehouse))].sort((a, b) => a.localeCompare(b, "ru"));
    el.warehouseFilter.innerHTML = `<option value="${ALL_WAREHOUSES}">Все склады</option>`;
    warehouses.forEach((warehouse) => {
      const option = document.createElement("option");
      option.value = warehouse;
      option.textContent = warehouse;
      el.warehouseFilter.append(option);
    });
    if (warehouses.includes(selected)) el.warehouseFilter.value = selected;
  }

  function populateCalcWarehousesControl(data) {
    if (!el.calcWarehousesChecklist) return;
    const warehouses = [...new Set((data || []).map((r) => String(r.warehouse || "").trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "ru")
    );
    state.availableCalcWarehouses = warehouses;
    if (!state.warehouseSelectionTouched && !state.selectedCalcWarehouses.length && warehouses.length) {
      state.selectedCalcWarehouses = warehouses;
    } else {
      state.selectedCalcWarehouses = state.selectedCalcWarehouses.filter((x) => warehouses.includes(x));
      if (!state.warehouseSelectionTouched && !state.selectedCalcWarehouses.length && warehouses.length) {
        state.selectedCalcWarehouses = warehouses;
      }
    }
    renderCalcWarehousesChecklist();
    updateCalcWarehousesDropdownButton();
  }

  function syncSelectedCalcWarehousesFromChecklist() {
    if (!el.calcWarehousesChecklist) return;
    const selected = Array.from(el.calcWarehousesChecklist.querySelectorAll('input[type="checkbox"]:checked')).map((input) =>
      String(input.value || "")
    );
    state.selectedCalcWarehouses = selected;
  }

  function getFilteredData(options = {}) {
    const search = (el.searchInput.value || "").trim().toLowerCase();
    const selectedWarehouse = el.warehouseFilter.value || ALL_WAREHOUSES;
    return state.processedData.filter((row) => {
      const whOk = options.ignoreWarehouse || selectedWarehouse === ALL_WAREHOUSES || row.warehouse === selectedWarehouse;
      const searchOk =
        !search ||
        row.sku.toLowerCase().includes(search) ||
        row.name.toLowerCase().includes(search) ||
        row.barcode.toLowerCase().includes(search);
      const avgOrders = state.daysInReport > 0 ? row.ordered / state.daysInReport : 0;
      const avgFallback = state.daysInReport > 0 ? row.bought / state.daysInReport : 0;
      const avgDaily = avgOrders > 0 ? avgOrders : avgFallback;
      const daysOfStock = avgDaily > 0 ? row.totalStock / avgDaily : Infinity;
      const riskOk = !el.showOnlyRisk.checked || daysOfStock < state.lowStockDays;
      return whOk && searchOk && riskOk;
    });
  }

  function renderAll() {
    const rows = getFilteredData();
    const reportRows = state.showWarehouseDetails ? aggregateForReportByWarehouse(rows) : aggregateForReport(rows);
    const cabinetRows = aggregateForReport(state.processedData);
    renderReportTable(reportRows);
    renderDashboardTopTable(cabinetRows);
    renderMarkers(el.dashboardMarkers, cabinetRows);
    renderAnalytics();
    renderKpi(reportRows);
    renderShipmentTable(state.shipmentResultData);
    renderSideSummary(state.shipmentResultData, rows);
    drawForecastFromRows(rows);
    drawHeroMiniChart(rows);
  }

  function renderAnalytics() {
    const rows = aggregateForReport(state.processedData);
    populateAnalyticsCategoryFilter(state.processedData);
    const filtered = getAnalyticsFilteredRows(rows);
    renderAnalyticsTable(filtered);
    renderMarkers(el.analyticsMarkers, filtered);
    renderWarehouseAnalyticsTable(state.processedData);
    renderTurnoverAnalyticsTable(rows);
  }

  function renderTurnoverAnalyticsTable(rows) {
    if (!el.analyticsTurnoverTable) return;
    if (!rows || !rows.length) {
      el.analyticsTurnoverTable.innerHTML = `<div class="empty">Нет данных для расчета оборачиваемости</div>`;
      return;
    }

    const dateKeys = getLastDaysKeys(14);
    const bySku = state.dailyOrdersBySku && typeof state.dailyOrdersBySku === "object" ? state.dailyOrdersBySku : {};
    const useDailyMap = Object.keys(bySku).length > 0;
    const sorted = [...rows].sort((a, b) => toNum(b.ordered, 0) - toNum(a.ordered, 0));
    const headers = ["Артикул", ...dateKeys];

    let html = `<div class="table-scroll"><table class="turnover-table"><thead><tr>`;
    headers.forEach((h, idx) => {
      const cls = idx === 0 ? ' class="sticky-col"' : "";
      html += `<th${cls}>${escapeHtml(h)}</th>`;
    });
    html += `</td></thead><tbody>`;

    sorted.forEach((row) => {
      const sku = String(row.sku || "").trim();
      const perDayFallback = state.daysInReport > 0 ? toNum(row.ordered, 0) / state.daysInReport : 0;
      html += "<tr>";
      html += `<td class="sticky-col"><b>${escapeHtml(sku)}</b></td>`;
      dateKeys.forEach((dayKey) => {
        const daily = useDailyMap ? toNum(bySku?.[sku]?.[dayKey], 0) : perDayFallback;
        const turnoverDays = daily > 0 ? toNum(row.totalStock, 0) / daily : Number.POSITIVE_INFINITY;
        const cls = getTurnoverCellClass(turnoverDays);
        const text = Number.isFinite(turnoverDays) ? turnoverDays.toFixed(1) : "∞";
        html += `<td class="${cls}" title="Заказы за день: ${Math.round(daily)}">${text}</td>`;
      });
      html += "</tr>";
    });

    html += `</tbody></table></div>`;
    if (!useDailyMap) {
      html += `<div class="hint">Помесячные данные без разбивки по дням: использован средний дневной спрос за период.</div>`;
    }
    el.analyticsTurnoverTable.innerHTML = html;
  }

  function renderWarehouseAnalyticsTable(rows) {
    if (!el.analyticsWarehouseTable) return;
    if (!rows || !rows.length) {
      el.analyticsWarehouseTable.innerHTML = `<div class="empty">Нет данных по складам</div>`;
      return;
    }
    const map = {};
    rows.forEach((row) => {
      const warehouse = String(row.warehouse || "").trim() || "—";
      if (!map[warehouse]) {
        map[warehouse] = {
          warehouse,
          stock: 0,
          inTransit: 0,
          totalStock: 0,
          ordered: 0,
          bought: 0,
          skuCount: 0,
        };
      }
      map[warehouse].stock += toNum(row.stock, 0);
      map[warehouse].inTransit += toNum(row.inTransit, 0);
      map[warehouse].totalStock += toNum(row.totalStock, 0);
      map[warehouse].ordered += toNum(row.ordered, 0);
      map[warehouse].bought += toNum(row.bought, 0);
      map[warehouse].skuCount += 1;
    });

    const query = String(el.analyticsWarehouseSearchInput?.value || "").trim().toLowerCase();
    const sort = String(el.analyticsWarehouseSortSelect?.value || "orders_desc");
    const list = Object.values(map).filter((row) => {
      return !query || row.warehouse.toLowerCase().includes(query);
    });
    list.sort((a, b) => {
      if (sort === "orders_asc") return a.ordered - b.ordered;
      if (sort === "coverage_asc") {
        const aDays = state.daysInReport > 0 && a.ordered > 0 ? a.totalStock / (a.ordered / state.daysInReport) : Number.POSITIVE_INFINITY;
        const bDays = state.daysInReport > 0 && b.ordered > 0 ? b.totalStock / (b.ordered / state.daysInReport) : Number.POSITIVE_INFINITY;
        return aDays - bDays;
      }
      if (sort === "coverage_desc") {
        const aDays = state.daysInReport > 0 && a.ordered > 0 ? a.totalStock / (a.ordered / state.daysInReport) : Number.POSITIVE_INFINITY;
        const bDays = state.daysInReport > 0 && b.ordered > 0 ? b.totalStock / (b.ordered / state.daysInReport) : Number.POSITIVE_INFINITY;
        return bDays - aDays;
      }
      if (sort === "stock_desc") return b.totalStock - a.totalStock;
      return b.ordered - a.ordered;
    });
    const headers = ["Склад", "SKU", "Остаток", "В пути", "Итого", "Заказы", "Продажи", "Покрытие", "Маркер"];
    let html = `<table><thead><tr><th>${headers.join("</th><th>")}</th></tr></thead><tbody>`;
    list.forEach((row) => {
      const perDay = state.daysInReport > 0 ? row.ordered / state.daysInReport : 0;
      const days = perDay > 0 ? row.totalStock / perDay : Infinity;
      const expanded = state.expandedAnalyticsWarehouses.has(row.warehouse);
      const expandText = expanded ? "Скрыть артикулы" : "Показать артикулы";
      html += `<tr>
        <td><button type="button" class="analytics-toggle-btn" data-expand-warehouse="${escapeHtml(row.warehouse)}">${escapeHtml(
        row.warehouse
      )} <span>${expandText}</span></button></td>
        <td>${row.skuCount}</td>
        <td>${Math.round(row.stock)}</td>
        <td>${Math.round(row.inTransit)}</td>
        <td><b>${Math.round(row.totalStock)}</b></td>
        <td>${Math.round(row.ordered)}</td>
        <td>${Math.round(row.bought)}</td>
        <td>${Number.isFinite(days) ? days.toFixed(1) : "∞"} дн.</td>
        <td>${getCoverageMarker(days)}</td>
      </tr>`;
      if (expanded) {
        const skuRows = getWarehouseSkuBreakdown(row.warehouse);
        html += `<tr class="analytics-detail-row">
          <td colspan="${headers.length}">
            <div class="analytics-detail-wrap">
              ${renderAnalyticsDetailTable(
                ["Артикул", "Наименование", "Остаток", "В пути", "Итого", "Заказы", "Продажи", "Покрытие", "Маркер"],
                skuRows.map((item) => {
                  const perDaySku = state.daysInReport > 0 ? item.ordered / state.daysInReport : 0;
                  const daysSku = perDaySku > 0 ? item.totalStock / perDaySku : Number.POSITIVE_INFINITY;
                  return [
                    escapeHtml(item.sku),
                    escapeHtml(item.name || "—"),
                    Math.round(item.stock),
                    Math.round(item.inTransit),
                    `<b>${Math.round(item.totalStock)}</b>`,
                    Math.round(item.ordered),
                    Math.round(item.bought),
                    `${Number.isFinite(daysSku) ? daysSku.toFixed(1) : "∞"} дн.`,
                    getCoverageMarker(daysSku),
                  ];
                })
              )}
            </div>
          </td>
        </tr>`;
      }
    });
    html += "</tbody></table>";
    el.analyticsWarehouseTable.innerHTML = html;
  }
  function runShipmentAnalysis() {
    if (!state.processedData.length) {
      state.shipmentResultData = [];
      renderShipmentTable([]);
      renderSideSummary([], []);
      updateShipmentKpi();
      return;
    }

    const rows = getFilteredData({ ignoreWarehouse: true });
    const rounded = !!el.enableRounding.checked;
    const hideSmall = !!el.hideSmall.checked;
    const calcMethod = el.calcMethod.value;
    const turnoverDays = Math.max(1, toNum(el.turnoverDays?.value || state.turnoverDays, 45));
    state.turnoverDays = turnoverDays;
    const turnoverMultiplier = turnoverDays / 30;
    const selectedWarehouses = getEffectiveCalcWarehouses(rows);
    if (!selectedWarehouses.length) {
      state.shipmentResultData = [];
      el.shipmentTable.innerHTML = `<div class="empty">Выберите хотя бы один склад для расчета.</div>`;
      renderSideSummary([], rows);
      updateShipmentKpi();
      el.downloadShipmentBtn.style.display = "none";
      persistUserSettingsForCurrentUser();
      return;
    }
    const shares = getNormalizedWarehouseShares(selectedWarehouses, rows);
    const skuMap = {};

    rows.forEach((row) => {
      const sku = row.sku;
      if (!skuMap[sku]) {
        skuMap[sku] = {
          sku,
          name: row.name || "—",
          totalFactMonthly: 0,
          totalStock: 0,
          planMonthly: toNum(state.salesPlanMap[normalizeSkuToken(sku)] || 0, 0),
          warehouses: {},
        };
      }
      const factMonthly = calcFactMonthlyByRow(row, calcMethod);
      skuMap[sku].totalFactMonthly += factMonthly;
      skuMap[sku].totalStock += row.totalStock || 0;
      if (!skuMap[sku].warehouses[row.warehouse]) {
        skuMap[sku].warehouses[row.warehouse] = { stock: 0, factMonthly: 0 };
      }
      skuMap[sku].warehouses[row.warehouse].stock += row.totalStock || 0;
      skuMap[sku].warehouses[row.warehouse].factMonthly += factMonthly;
    });

    const result = Object.values(skuMap).map((item) => {
      // Фильтр: скрыть товары с общей оборачиваемостью > 30 дней
      const hideOverstock = el.hideOverstockTurnover?.checked;
      if (hideOverstock) {
        const totalFactMonthly = item.totalFactMonthly || 0;
        const avgDaily = totalFactMonthly / 30;
        const globalTurnover = avgDaily > 0 ? item.totalStock / avgDaily : Infinity;
        if (globalTurnover > 30) return null;
      }

      const baseMonthlyDemand =
        state.calcMode === "plan_max" ? Math.max(item.planMonthly || 0, item.totalFactMonthly || 0) : item.totalFactMonthly || 0;
      if (!(baseMonthlyDemand > 0)) return null;
      const perWarehouse = {};
      let totalShipment = 0;
      selectedWarehouses.forEach((warehouse) => {
        const whData = item.warehouses[warehouse] || { stock: 0, factMonthly: 0 };
        const sharePct = shares[warehouse] || 0;
        const rawNeed = baseMonthlyDemand * (sharePct / 100) * turnoverMultiplier - whData.stock;
        let shipmentQty = calcShipmentQtyByRules(rawNeed, rounded);
        if (hideSmall && shipmentQty < 5) shipmentQty = 0;
        perWarehouse[warehouse] = {
          stock: whData.stock,
          sharePct,
          rawNeed,
          shipmentQty,
        };
        totalShipment += shipmentQty;
      });
      const avgDailyFact = (item.totalFactMonthly || 0) / 30;
      return {
        sku: item.sku,
        name: item.name || "—",
        planMonthly: item.planMonthly || 0,
        factMonthly: item.totalFactMonthly || 0,
        baseMonthlyDemand,
        avgDailyFact,
        totalStock: item.totalStock || 0,
        perWarehouse,
        warehouses: selectedWarehouses,
        totalShipment,
        boxes: Math.ceil(totalShipment / 20),
        status: getShipmentStatus(totalShipment, avgDailyFact, item.totalStock || 0),
      };
    }).filter(Boolean);

    const filtered = hideSmall ? result.filter((r) => r.totalShipment >= 5) : result.filter((r) => r.totalShipment > 0);
    filtered.sort((a, b) => b.totalShipment - a.totalShipment);

    state.shipmentResultData = filtered;
    renderShipmentTable(filtered);
    renderSideSummary(filtered, rows);
    updateShipmentKpi();
    el.downloadShipmentBtn.style.display = filtered.length ? "inline-flex" : "none";
    persistUserSettingsForCurrentUser();
  }

  function getShipmentStatus(shipmentQty, avgDailySales, stock) {
    const daysBefore = avgDailySales > 0 ? stock / avgDailySales : 999;
    const daysAfter = avgDailySales > 0 ? (stock + shipmentQty) / avgDailySales : 999;
    if (daysBefore < state.lowStockDays) return { label: "Дефицит", className: "bad" };
    if (daysAfter > state.overstockDays) return { label: "Излишек", className: "warn" };
    return { label: "Норма", className: "good" };
  }

  function getEffectiveCalcWarehouses(rows) {
    const all = [...new Set((rows || []).map((r) => String(r.warehouse || "").trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "ru")
    );
    state.availableCalcWarehouses = all;
    let selected = Array.isArray(state.selectedCalcWarehouses) ? state.selectedCalcWarehouses.filter((w) => all.includes(w)) : [];
    if (!state.warehouseSelectionTouched && !selected.length) selected = all;
    state.selectedCalcWarehouses = selected;
    renderCalcWarehousesChecklist();
    updateCalcWarehousesDropdownButton();
    return selected;
  }

  function ensureWarehouseShareMap() {
    const rows = state.processedData || [];
    const selected = getEffectiveCalcWarehouses(rows);
    const auto = estimateWarehouseShares(selected, rows);
    if (state.autoWarehouseShare) {
      state.warehouseShareMap = { ...auto };
      return;
    }
    const next = {};
    selected.forEach((warehouse) => {
      const userValue = toNum(state.warehouseShareMap[warehouse], NaN);
      next[warehouse] = Number.isFinite(userValue) ? clamp(userValue, 0, 100) : auto[warehouse];
    });
    state.warehouseShareMap = next;
  }

  function estimateWarehouseShares(selectedWarehouses, rows) {
    const totals = {};
    const sourceRows = Array.isArray(rows) ? rows : [];
    const totalOrdersAllWarehouses = sourceRows.reduce((acc, row) => acc + Math.max(0, toNum(row.ordered, 0)), 0);

    // Доля склада = его заказы / все заказы кабинета (а не только выбранных складов).
    selectedWarehouses.forEach((warehouse) => {
      const ordersOnWarehouse = sourceRows.reduce(
        (acc, row) => acc + (row.warehouse === warehouse ? Math.max(0, toNum(row.ordered, 0)) : 0),
        0
      );
      totals[warehouse] = ordersOnWarehouse;
    });

    if (totalOrdersAllWarehouses <= 0) {
      const equal = selectedWarehouses.length ? 100 / selectedWarehouses.length : 0;
      selectedWarehouses.forEach((warehouse) => {
        totals[warehouse] = Number(equal.toFixed(2));
      });
      return totals;
    }

    selectedWarehouses.forEach((warehouse) => {
      totals[warehouse] = Number(((totals[warehouse] / totalOrdersAllWarehouses) * 100).toFixed(2));
    });
    return totals;
  }

  function getNormalizedWarehouseShares(selectedWarehouses, rows) {
    ensureWarehouseShareMap();
    const shares = {};
    let sum = 0;
    selectedWarehouses.forEach((warehouse) => {
      const v = clamp(toNum(state.warehouseShareMap[warehouse], 0), 0, 100);
      shares[warehouse] = v;
      sum += v;
    });
    if (sum <= 0) {
      return estimateWarehouseShares(selectedWarehouses, rows);
    }
    return shares;
  }

  function renderWarehouseShareGrid() {
    if (!el.warehouseShareGrid) return;
    const warehouses = state.selectedCalcWarehouses || [];
    if (!warehouses.length) {
      el.warehouseShareGrid.innerHTML = `<div class="empty">Склады появятся после загрузки данных.</div>`;
      return;
    }
    let html = "";
    warehouses.forEach((warehouse) => {
      const value = toNum(state.warehouseShareMap[warehouse], 0);
      const disabled = state.autoWarehouseShare ? "disabled" : "";
      html += `<label class="warehouse-share-row">
        <span>${escapeHtml(warehouse)}</span>
        <input type="number" data-warehouse="${escapeHtml(warehouse)}" min="0" max="100" step="0.1" value="${value}" ${disabled}>
      </label>`;
    });
    el.warehouseShareGrid.innerHTML = html;
  }

  function renderCalcWarehousesChecklist() {
    if (!el.calcWarehousesChecklist) return;
    const query = String(el.calcWarehousesSearch?.value || "").trim().toLowerCase();
    const warehouses = (state.availableCalcWarehouses || []).filter((warehouse) => {
      return !query || warehouse.toLowerCase().includes(query);
    });
    if (!warehouses.length) {
      el.calcWarehousesChecklist.innerHTML = `<div class="empty">Склады не найдены.</div>`;
      return;
    }
    let html = "";
    warehouses.forEach((warehouse) => {
      const checked = state.selectedCalcWarehouses.includes(warehouse) ? "checked" : "";
      html += `<label class="multi-check-item">
        <input type="checkbox" value="${escapeHtml(warehouse)}" ${checked}>
        <span>${escapeHtml(warehouse)}</span>
      </label>`;
    });
    el.calcWarehousesChecklist.innerHTML = html;
  }

  function updateCalcWarehousesDropdownButton() {
    if (!el.calcWarehousesDropdownBtn) return;
    const selectedCount = state.selectedCalcWarehouses.length;
    if (!selectedCount) {
      el.calcWarehousesDropdownBtn.textContent = "Склады не выбраны";
      return;
    }
    if (selectedCount <= 2) {
      el.calcWarehousesDropdownBtn.textContent = state.selectedCalcWarehouses.join(", ");
      return;
    }
    el.calcWarehousesDropdownBtn.textContent = `Выбрано складов: ${selectedCount}`;
  }

  function calcFactMonthlyByRow(row, calcMethod) {
    const buyoutCoef = Number.isFinite(row.buyoutPercent) ? row.buyoutPercent / 100 : 1;
    const orderedAdjusted = toNum(row.ordered, 0) * (buyoutCoef > 0 ? buyoutCoef : 1);
    const factPeriod = calcMethod === "ordered" ? orderedAdjusted : toNum(row.bought, 0);
    const daily = state.daysInReport > 0 ? factPeriod / state.daysInReport : 0;
    return daily * 30;
  }

  function calcShipmentQtyByRules(required, rounded) {
    if (!(required > 0)) return 0;
    if (!rounded) return Math.ceil(required);
    const v = Math.round(required);
    if (v >= 1 && v <= 4) return 0;
    if (v >= 40 && v <= 60) return 50;
    if (v >= 140 && v <= 160) return 150;
    return Math.max(0, Math.round(v / 5) * 5);
  }

  function runAbcAnalysis() {
    const rows = getFilteredData({ ignoreWarehouse: true });
    if (!rows.length) {
      state.abcResultData = [];
      renderAbcTable([]);
      return;
    }
    const grouped = {};
    rows.forEach((row) => {
      const key = `${row.barcode}__${row.size}`;
      if (!grouped[key]) grouped[key] = { name: row.name, sku: row.sku, size: row.size, revenue: 0 };
      grouped[key].revenue += row.revenue;
    });
    const list = Object.values(grouped).sort((a, b) => b.revenue - a.revenue);
    const total = list.reduce((sum, item) => sum + item.revenue, 0);
    let cumulative = 0;
    list.forEach((item) => {
      cumulative += item.revenue;
      const pct = total > 0 ? (cumulative / total) * 100 : 0;
      item.category = pct <= 80 ? "A" : pct <= 95 ? "B" : "C";
      item.cumulative = `${pct.toFixed(2)}%`;
    });
    state.abcResultData = list;
    renderAbcTable(list);
  }

  function runRedistributionAnalysis() {
    const rows = getFilteredData({ ignoreWarehouse: true });
    const optimalDays = toNum(el.optimalDays.value, 30);
    const transitDays = 7;
    const grouped = {};
    rows.forEach((row) => {
      const key = `${row.barcode}__${row.size}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    });

    const plan = [];
    Object.values(grouped).forEach((items) => {
      if (items.length < 2) return;
      const deltas = items.map((row) => {
        const daily = state.daysInReport > 0 ? row.ordered / state.daysInReport : 0;
        const projected = Math.max(0, row.totalStock - daily * transitDays);
        const desired = daily * optimalDays;
        return { sku: row.sku, name: row.name, size: row.size, warehouse: row.warehouse, delta: projected - desired };
      });
      const surplus = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta);
      const deficit = deltas.filter((d) => d.delta < 0).map((d) => ({ ...d, delta: -d.delta })).sort((a, b) => b.delta - a.delta);
      while (surplus.length && deficit.length) {
        const from = surplus[0];
        const to = deficit[0];
        const qty = Math.floor(Math.min(from.delta, to.delta));
        if (qty > 0) plan.push({ sku: from.sku, name: from.name, size: from.size, from: from.warehouse, to: to.warehouse, quantity: qty });
        from.delta -= qty;
        to.delta -= qty;
        if (from.delta < 1) surplus.shift();
        if (to.delta < 1) deficit.shift();
      }
    });
    state.redistributionData = plan;
    renderRedistributionTable(plan);
  }

  function renderReportTable(rows) {
    const headers = ["SKU", "Склад", "Остаток", "В пути", "Итого", "Заказы/день", "Выкуп, %", "Покрытие", "Статус"];
    if (!rows.length) {
      el.reportTable.innerHTML = `<div class="empty">Нет данных для отчета</div>`;
      return;
    }
    let html = `<table><thead><tr><th>${headers.join("</th><th>")}</th></tr></thead><tbody>`;
    rows.forEach((row) => {
      const ordersPerDay = state.daysInReport > 0 ? row.ordered / state.daysInReport : 0;
      const fallbackPerDay = state.daysInReport > 0 ? row.bought / state.daysInReport : 0;
      const perDay = ordersPerDay > 0 ? ordersPerDay : fallbackPerDay;
      const buyoutPct = Number.isFinite(row.buyoutPercent) ? row.buyoutPercent : 0;
      const days = perDay > 0 ? row.totalStock / perDay : 999;
      const cls = row.totalStock === 0 ? "row-bad" : days < state.lowStockDays ? "row-warn" : "";
      const status = getCoverageMarker(days);
      html += `<tr class="${cls}">
        <td>${escapeHtml(row.sku)}${row.sizeCount > 1 ? ` <small style="color:#64748b;">(${row.sizeCount} разм.)</small>` : ""}</td>
        <td>${escapeHtml(row.warehouse)}</td>
        <td>${row.stock}</td>
        <td>${row.inTransit || 0}</td>
        <td><b>${row.totalStock}</b></td>
        <td>${perDay.toFixed(2)}</td>
        <td>${buyoutPct.toFixed(1)}%</td>
        <td>${days.toFixed(1)} дн.</td>
        <td>${status}</td>
      </tr>`;
    });
    html += "</tbody></table>";
    el.reportTable.innerHTML = html;
  }

  function renderDashboardTopTable(rows) {
    if (!el.dashboardTopTable) return;
    if (!rows.length) {
      el.dashboardTopTable.innerHTML = `<div class="empty">Нет данных для топа по заказам</div>`;
      return;
    }
    const top = [...rows].sort((a, b) => (b.ordered || 0) - (a.ordered || 0)).slice(0, 15);
    const headers = ["#", "Артикул", "Наименование", "Заказы", "Остаток", "В пути", "Покрытие", "Маркер"];
    let html = `<table><thead><tr><th>${headers.join("</th><th>")}</th></tr></thead><tbody>`;
    top.forEach((row, idx) => {
      const perDay = getAvgDailyOrdersAdjusted(row);
      const days = perDay > 0 ? row.totalStock / perDay : Infinity;
      const marker = getCoverageMarker(days);
      html += `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(row.sku)}</td>
        <td>${escapeHtml(row.name || "—")}</td>
        <td><b>${row.ordered}</b></td>
        <td>${row.stock}</td>
        <td>${row.inTransit || 0}</td>
        <td>${Number.isFinite(days) ? days.toFixed(1) : "∞"} дн.</td>
        <td>${marker}</td>
      </tr>`;
    });
    html += "</tbody></table>";
    el.dashboardTopTable.innerHTML = html;
  }

  function renderAnalyticsTable(rows) {
    if (!el.analyticsReportTable) return;
    if (!rows.length) {
      el.analyticsReportTable.innerHTML = `<div class="empty">Нет данных по фильтрам аналитики</div>`;
      return;
    }
    const headers = [
      "Артикул",
      "Наименование",
      "Категория",
      "Бренд",
      "Заказы",
      "План/мес",
      "Остаток",
      "В пути",
      "Итого",
      "Выкуп, %",
      "Покрытие",
      "Маркер",
    ];
    let html = `<table><thead><tr><th>${headers.join("</th><th>")}</th></tr></thead><tbody>`;
    rows.forEach((row) => {
      const perDay = getAvgDailyOrdersAdjusted(row);
      const days = perDay > 0 ? row.totalStock / perDay : Infinity;
      const marker = getCoverageMarker(days);
      const skuKey = normalizeSkuToken(row.sku);
      const planMonthly = Math.max(0, toNum(state.salesPlanMap?.[skuKey], 0));
      const factMonthly = state.daysInReport > 0 ? (toNum(row.bought, 0) / state.daysInReport) * 30 : 0;
      const isPlanLag = planMonthly > 0 && factMonthly < planMonthly * 0.8;
      const planClass = isPlanLag ? ' class="cell-plan-bad"' : "";
      const expanded = state.expandedAnalyticsSkus.has(row.sku);
      const expandText = expanded ? "Скрыть склады" : "Показать склады";
      html += `<tr>
        <td><button type="button" class="analytics-toggle-btn" data-expand-sku="${escapeHtml(row.sku)}">${escapeHtml(
        row.sku
      )} <span>${expandText}</span></button></td>
        <td>${escapeHtml(row.name || "—")}</td>
        <td>${escapeHtml(row.category || "Без категории")}</td>
        <td>${escapeHtml(row.brand || "—")}</td>
        <td>${row.ordered}</td>
        <td${planClass}>${Math.round(planMonthly)}</td>
        <td>${row.stock}</td>
        <td>${row.inTransit || 0}</td>
        <td><b>${row.totalStock}</b></td>
        <td>${(row.buyoutPercent || 0).toFixed(1)}%</td>
        <td>${Number.isFinite(days) ? days.toFixed(1) : "∞"} дн.</td>
        <td>${marker}</td>
      </tr>`;
      if (expanded) {
        const warehouseRows = getSkuWarehouseBreakdown(row.sku);
        html += `<tr class="analytics-detail-row">
          <td colspan="${headers.length}">
            <div class="analytics-detail-wrap">
              ${renderAnalyticsDetailTable(
                ["Склад", "Остаток", "В пути", "Итого", "Заказы", "Продажи", "Покрытие", "Маркер"],
                warehouseRows.map((item) => {
                  const perDayWh = state.daysInReport > 0 ? item.ordered / state.daysInReport : 0;
                  const daysWh = perDayWh > 0 ? item.totalStock / perDayWh : Number.POSITIVE_INFINITY;
                  return [
                    escapeHtml(item.warehouse),
                    Math.round(item.stock),
                    Math.round(item.inTransit),
                    `<b>${Math.round(item.totalStock)}</b>`,
                    Math.round(item.ordered),
                    Math.round(item.bought),
                    `${Number.isFinite(daysWh) ? daysWh.toFixed(1) : "∞"} дн.`,
                    getCoverageMarker(daysWh),
                  ];
                })
              )}
            </div>
          </td>
        </tr>`;
      }
    });
    html += "</tbody></table>";
    el.analyticsReportTable.innerHTML = html;
  }

  function getSkuWarehouseBreakdown(sku) {
    const map = {};
    (state.processedData || []).forEach((row) => {
      if (row.sku !== sku) return;
      const warehouse = String(row.warehouse || "").trim() || "—";
      if (!map[warehouse]) {
        map[warehouse] = { warehouse, stock: 0, inTransit: 0, totalStock: 0, ordered: 0, bought: 0 };
      }
      map[warehouse].stock += toNum(row.stock, 0);
      map[warehouse].inTransit += toNum(row.inTransit, 0);
      map[warehouse].totalStock += toNum(row.totalStock, 0);
      map[warehouse].ordered += toNum(row.ordered, 0);
      map[warehouse].bought += toNum(row.bought, 0);
    });
    return Object.values(map).sort((a, b) => b.ordered - a.ordered);
  }

  function getWarehouseSkuBreakdown(warehouseName) {
    const map = {};
    (state.processedData || []).forEach((row) => {
      if (String(row.warehouse || "") !== warehouseName) return;
      const sku = String(row.sku || "").trim();
      if (!sku) return;
      if (!map[sku]) {
        map[sku] = { sku, name: row.name || "—", stock: 0, inTransit: 0, totalStock: 0, ordered: 0, bought: 0 };
      }
      map[sku].stock += toNum(row.stock, 0);
      map[sku].inTransit += toNum(row.inTransit, 0);
      map[sku].totalStock += toNum(row.totalStock, 0);
      map[sku].ordered += toNum(row.ordered, 0);
      map[sku].bought += toNum(row.bought, 0);
    });
    return Object.values(map).sort((a, b) => b.ordered - a.ordered);
  }

  function renderAnalyticsDetailTable(headers, rowValues) {
    if (!rowValues.length) return `<div class="empty">Нет данных для детализации</div>`;
    let html = `<table class="detail-table"><thead><tr><th>${headers.join("</th><th>")}</th></tr></thead><tbody>`;
    rowValues.forEach((cells) => {
      html += `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    });
    html += "</tbody></table>";
    return html;
  }

  function renderMarkers(container, rows) {
    if (!container) return;
    const stats = countCoverageBuckets(rows);
    container.innerHTML = `
      <div class="summary-card marker-stat marker-deficit">
        <div class="label">Дефицит (&lt; ${state.lowStockDays} дн.)</div>
        <div class="value">${stats.deficit}</div>
      </div>
      <div class="summary-card marker-stat marker-normal">
        <div class="label">Норма (${state.lowStockDays}-${state.overstockDays} дн.)</div>
        <div class="value">${stats.normal}</div>
      </div>
      <div class="summary-card marker-stat marker-overstock">
        <div class="label">Излишек (&gt; ${state.overstockDays} дн.)</div>
        <div class="value">${stats.overstock}</div>
      </div>
    `;
  }

  function populateAnalyticsCategoryFilter(rows) {
    if (!el.analyticsCategoryFilter) return;
    const current = el.analyticsCategoryFilter.value || "__ALL__";
    const categories = [...new Set(rows.map((r) => normalizeCategory(r.category, r.sku)))].sort((a, b) =>
      String(a).localeCompare(String(b), "ru")
    );
    el.analyticsCategoryFilter.innerHTML = '<option value="__ALL__">Все категории</option>';
    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      el.analyticsCategoryFilter.append(opt);
    });
    if (["__ALL__", ...categories].includes(current)) el.analyticsCategoryFilter.value = current;
  }

  function getAnalyticsFilteredRows(rows) {
    const query = String(el.analyticsSearchInput?.value || "").trim().toLowerCase();
    const category = el.analyticsCategoryFilter?.value || "__ALL__";
    const sort = el.analyticsSortSelect?.value || "orders_desc";
    const filtered = rows.filter((row) => {
      const categoryOk = category === "__ALL__" || (row.category || "Без категории") === category;
      const searchOk = !query || row.sku.toLowerCase().includes(query) || String(row.name || "").toLowerCase().includes(query);
      return categoryOk && searchOk;
    });
    filtered.sort((a, b) => {
      if (sort === "orders_asc") return (a.ordered || 0) - (b.ordered || 0);
      if (sort === "coverage_asc") return getCoverageDays(a) - getCoverageDays(b);
      if (sort === "coverage_desc") return getCoverageDays(b) - getCoverageDays(a);
      return (b.ordered || 0) - (a.ordered || 0);
    });
    return filtered;
  }

  function countCoverageBuckets(rows) {
    let deficit = 0;
    let normal = 0;
    let overstock = 0;
    rows.forEach((row) => {
      const days = getCoverageDays(row);
      if (days < state.lowStockDays) deficit += 1;
      else if (days > state.overstockDays) overstock += 1;
      else normal += 1;
    });
    return { deficit, normal, overstock };
  }

  function getCoverageDays(row) {
    const perDay = getAvgDailyOrdersAdjusted(row);
    return perDay > 0 ? row.totalStock / perDay : Number.POSITIVE_INFINITY;
  }

  function getAvgDailyOrdersAdjusted(row) {
    const perDayOrders = state.daysInReport > 0 ? row.ordered / state.daysInReport : 0;
    const buyoutCoef = Number.isFinite(row.buyoutPercent) ? row.buyoutPercent / 100 : 1;
    return perDayOrders * (buyoutCoef > 0 ? buyoutCoef : 1);
  }

  function getCoverageMarker(days) {
    if (days < state.lowStockDays) return '<span class="chip bad">Дефицит</span>';
    if (days > state.overstockDays) return '<span class="chip warn">Излишек</span>';
    return '<span class="chip good">Норма</span>';
  }
  function renderShipmentTable(rows) {
    if (!rows.length) {
      el.shipmentTable.innerHTML = `<div class="empty">Рекомендации к поставке появятся после расчета</div>`;
      return;
    }
    const warehouses = rows[0].warehouses || [];
    const headers = [
      "SKU",
      "Наименование",
      "План/мес",
      "Факт/мес",
      "База расчета",
      ...warehouses.map((w) => `${w}, к поставке`),
      "Итого",
      "Коробов",
      "Статус",
    ];
    let html = `<table><thead><tr><th>${headers.join("</th><th>")}</th></tr></thead><tbody>`;
    rows.forEach((row) => {
      const perWarehouseCells = warehouses
        .map((warehouse) => `<td><b>${row.perWarehouse?.[warehouse]?.shipmentQty || 0}</b></td>`)
        .join("");
      html += `<tr>
        <td>${escapeHtml(row.sku)}</td>
        <td>${escapeHtml(row.name || "—")}</td>
        <td>${Math.round(row.planMonthly || 0)}</td>
        <td>${Math.round(row.factMonthly || 0)}</td>
        <td>${Math.round(row.baseMonthlyDemand || 0)}</td>
        ${perWarehouseCells}
        <td><b>${row.totalShipment}</b></td>
        <td>${row.boxes}</td>
        <td><span class="chip ${row.status.className}">${row.status.label}</span></td>
      </tr>`;
    });
    html += "</tbody></table>";
    el.shipmentTable.innerHTML = html;
  }

  function renderAbcTable(rows) {
    if (!rows.length) {
      el.abcTable.innerHTML = `<div class="empty">Нет данных для ABC-анализа</div>`;
      return;
    }
    const headers = ["Категория", "Артикул", "Наименование", "Размер", "Выручка", "Накопительный %"];
    let html = `<table><thead><tr><th>${headers.join("</th><th>")}</th></tr></thead><tbody>`;
    rows.forEach((row) => {
      const chip = row.category === "A" ? "good" : row.category === "B" ? "warn" : "bad";
      html += `<tr>
        <td><span class="chip ${chip}">${row.category}</span></td>
        <td>${escapeHtml(row.sku)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.size)}</td>
        <td>${row.revenue.toFixed(2)} ₽</td>
        <td>${row.cumulative}</td>
      </tr>`;
    });
    html += "</tbody></table>";
    el.abcTable.innerHTML = html;
  }

  function renderRedistributionTable(rows) {
    if (!rows.length) {
      el.redistributionTable.innerHTML = `<div class="empty">Нет шагов для перераспределения</div>`;
      return;
    }
    const headers = ["Артикул", "Наименование", "Размер", "Откуда", "Куда", "Кол-во"];
    let html = `<table><thead><tr><th>${headers.join("</th><th>")}</th></tr></thead><tbody>`;
    rows.forEach((row) => {
      html += `<tr>
        <td>${escapeHtml(row.sku)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.size)}</td>
        <td>${escapeHtml(row.from)}</td>
        <td>${escapeHtml(row.to)}</td>
        <td><b>${row.quantity}</b></td>
      </tr>`;
    });
    html += "</tbody></table>";
    el.redistributionTable.innerHTML = html;
  }

  function renderKpi(rows) {
    const stock = rows.reduce((sum, r) => sum + (r.totalStock || 0), 0);
    const forecast30 = rows.reduce((sum, r) => {
      const ord = r.ordered / Math.max(1, state.daysInReport);
      const buyout = Number.isFinite(r.buyoutPercent) ? r.buyoutPercent / 100 : 1;
      return sum + Math.round(ord * buyout * 30);
    }, 0);
    const riskCount = rows.filter((r) => {
      const perDayOrders = state.daysInReport > 0 ? r.ordered / state.daysInReport : 0;
      const perDayFallback = state.daysInReport > 0 ? r.bought / state.daysInReport : 0;
      const buyout = Number.isFinite(r.buyoutPercent) ? r.buyoutPercent / 100 : 1;
      const perDay = perDayOrders > 0 ? perDayOrders * buyout : perDayFallback;
      const days = perDay > 0 ? r.totalStock / perDay : 999;
      return days < state.lowStockDays;
    }).length;
    el.kpiStock.textContent = String(stock);
    el.kpiForecast.textContent = String(forecast30);
    el.kpiRiskNote.textContent = `${riskCount} SKU`;
    el.kpiRisk.textContent = riskCount > 20 ? "Высокий" : riskCount > 6 ? "Средний" : "Низкий";
  }

  function updateShipmentKpi() {
    const totalShipment = state.shipmentResultData.reduce((sum, r) => sum + (r.totalShipment || 0), 0);
    el.kpiShipment.textContent = String(totalShipment);
  }

  function renderSideSummary(shipmentRows, rows) {
    const totalUnits = shipmentRows.reduce((sum, r) => sum + (r.totalShipment || 0), 0);
    const totalBoxes = shipmentRows.reduce((sum, r) => sum + (r.boxes || 0), 0);
    const maxUnits = Math.max(1, rows.reduce((sum, r) => sum + (r.totalStock || 0), 0));
    const percent = Math.min(100, Math.round((totalUnits / maxUnits) * 100));
    const dateText = el.deliveryDate.value || new Date().toISOString().slice(0, 10);
    const saving = Math.max(0, Math.round((rows.length ? totalUnits / rows.length : 0) / 10));
    el.sumUnits.textContent = `${totalUnits} шт`;
    el.sumBoxes.textContent = String(totalBoxes);
    el.sumDate.textContent = dateText;
    el.sumSaving.textContent = `${saving} дн`;
    el.donut.style.setProperty("--p", String(percent));
    el.donutValue.textContent = String(totalUnits);
  }

  function drawHeroMiniChart(rows) {
    const canvas = el.heroMiniChart;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const values = getMiniSeries(rows);
    const max = Math.max(1, ...values);
    ctx.strokeStyle = "#93c5fd";
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * (canvas.width - 30) + 15;
      const y = canvas.height - 20 - (v / max) * (canvas.height - 40);
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawForecastFromRows(rows) {
    const totalStock = rows.reduce((s, r) => s + (r.totalStock || 0), 0);
    const demandPerDay = rows.reduce((s, r) => s + (state.daysInReport > 0 ? r.bought / state.daysInReport : 0), 0);
    const stockSeries = [];
    const demandSeries = [];
    let current = totalStock;
    for (let day = 0; day < 60; day += 1) {
      const demand = demandPerDay * (0.85 + 0.3 * Math.sin(day / 6));
      demandSeries.push(Math.max(0, demand));
      current = Math.max(0, current - demand);
      stockSeries.push(current);
    }
    drawForecastChart(stockSeries, demandSeries);
  }

  function drawForecastChart(stockSeries, demandSeries) {
    const canvas = el.forecastChart;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#d7e3f4";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i += 1) {
      const y = 20 + ((h - 40) / 5) * i;
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
    }
    const max = Math.max(1, ...stockSeries, ...demandSeries);
    drawSeries(ctx, stockSeries, max, w, h, "#2f6fd0");
    drawSeries(ctx, demandSeries, max, w, h, "#f08a24");
  }

  function drawSeries(ctx, values, max, w, h, color) {
    if (!values.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = 30 + (i / (values.length - 1)) * (w - 50);
      const y = h - 20 - (v / max) * (h - 40);
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function getMiniSeries(rows) {
    if (!rows.length) return [6, 7, 7, 8, 7, 8, 9, 8, 9, 10, 9, 11];
    const base = rows.reduce((sum, r) => sum + (r.totalStock || 0), 0) / Math.max(1, rows.length);
    const arr = [];
    for (let i = 0; i < 18; i += 1) arr.push(Math.max(1, base * (0.8 + 0.35 * Math.sin(i / 2.5))));
    return arr;
  }

  function exportShipment(format) {
    if (!state.shipmentResultData.length) {
      alert("Сначала выполните расчет поставки.");
      return;
    }
    const rows = state.shipmentResultData.map((row) => {
      const out = {
        "Артикул продавца": row.sku,
        Наименование: row.name || "—",
        "План/мес": Math.round(row.planMonthly || 0),
        "Факт/мес": Math.round(row.factMonthly || 0),
        "База расчета": Math.round(row.baseMonthlyDemand || 0),
      };
      (row.warehouses || []).forEach((warehouse) => {
        out[`Поставка: ${warehouse}`] = row.perWarehouse?.[warehouse]?.shipmentQty || 0;
      });
      out["Кол-во для поставки"] = row.totalShipment || 0;
      out.Коробов = row.boxes || 0;
      out.Статус = row.status?.label || "—";
      return out;
    });

    if (format === "csv") {
      const headers = Object.keys(rows[0]);
      const lines = [headers.join(";")];
      rows.forEach((row) => lines.push(headers.map((h) => csvValue(row[h])).join(";")));
      downloadText(`shipment_${dateStamp()}.csv`, "\uFEFF" + lines.join("\n"), "text/csv;charset=utf-8;");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Поставка");
    XLSX.writeFile(wb, `shipment_${dateStamp()}.xlsx`);
  }

  function downloadTemplateCsv() {
    const template =
      "sku;name;barcode;size;warehouse;stock;bought;ordered;revenue\n" +
      "SKU-001;Тестовый товар;1234567890123;M;Коледино;50;30;35;12000\n";
    downloadText("wb_template.csv", "\uFEFF" + template, "text/csv;charset=utf-8;");
  }

  function claimApiActionSlot(skipCooldown) {
    if (skipCooldown) return true;
    const now = Date.now();
    const delta = now - state.lastApiActionAt;
    if (delta < API_BUTTON_COOLDOWN_MS) {
      const waitSec = Math.ceil((API_BUTTON_COOLDOWN_MS - delta) / 1000);
      renderApiResult(
        [{ name: "Rate limit", ok: false, status: "-", detail: `Подождите ${waitSec} сек.` }],
        "API-кнопки можно нажимать не чаще 1 раза в 10 секунд."
      );
      return false;
    }
    state.lastApiActionAt = now;
    return true;
  }

  async function runApiTokenTest() {
    if (!claimApiActionSlot()) return;
    const active = getActiveCabinet();
    if (active?.platform === "ozon") {
      const clientId = String(el.ozonClientIdInput?.value || active.ozonClientId || "").trim();
      const apiKey = String(el.ozonApiKeyInput?.value || active.ozonApiKey || "").trim();
      active.ozonClientId = clientId;
      active.ozonApiKey = apiKey;
      persistCabinetsForCurrentUser();
      if (!clientId || !apiKey) {
        renderApiResult([{ name: "Ozon", ok: false, status: "-", detail: "Заполните Client ID и API Key." }], "Нет данных для подключения.");
        return;
      }
      el.apiTestBtn.disabled = true;
      renderApiLoading("Проверка Ozon API...");
      const res = await fetchBackendJson("/api/ozon/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, apiKey }),
      });
      if (res.available && res.ok && res.data?.ok) {
        renderApiResult([{ name: "Ozon API", ok: true, status: 200, detail: String(res.data?.detail || "OK") }], "Подключение к Ozon успешно.");
      } else {
        renderApiResult(
          [{ name: "Ozon API", ok: false, status: res.status || "-", detail: String(res.data?.detail || res.data?.error || "Ошибка проверки") }],
          "Не удалось проверить Ozon API."
        );
      }
      el.apiTestBtn.disabled = false;
      return;
    }
    const token = (el.apiTokenInput?.value || getSavedApiTokenForCurrentUser() || "").trim();
    if (token && el.apiTokenInput && !el.apiTokenInput.value) el.apiTokenInput.value = token;
    const dateFrom = el.apiDateFrom?.value || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    if (!token) {
      renderApiResult([{ name: "Token", ok: false, detail: "Введите API токен." }], "Введите токен и повторите.");
      return;
    }
    setSavedApiTokenForCurrentUser(token);

    el.apiTestBtn.disabled = true;
    renderApiLoading();

    const endpoints = [
      {
        name: "Stocks",
        url: `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${encodeURIComponent(dateFrom)}`,
      },
      {
        name: "Orders",
        url: `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${encodeURIComponent(dateFrom)}`,
      },
      {
        name: "Sales",
        url: `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${encodeURIComponent(dateFrom)}`,
      },
      {
        name: "Incomes",
        url: `https://statistics-api.wildberries.ru/api/v1/supplier/incomes?dateFrom=${encodeURIComponent(dateFrom)}`,
      },
    ];

    const results = [];
    for (const endpoint of endpoints) {
      // Только GET-запросы: проверка прав read-only.
      results.push(await probeWbEndpoint(endpoint, token));
    }

    const summary = buildApiSummary(results);
    renderApiResult(results, summary);
    el.apiTestBtn.disabled = false;
  }

  async function loadStocksFromApi(options = {}) {
    if (!claimApiActionSlot(options.skipCooldown)) return;
    const active = getActiveCabinet();
    if (active?.platform === "ozon") {
      renderApiResult(
        [{ name: "Ozon", ok: true, status: "-", detail: "Ozon работает через отчёты. Загрузите XLSX (остатки) и CSV (заказы)." }],
        "Используйте кнопки «Остатки Ozon XLSX» и «Заказы Ozon CSV»."
      );
      return;
      /* --- API Ozon отключён --- */
      const clientId = String(el.ozonClientIdInput?.value || active.ozonClientId || "").trim();
      const apiKey = String(el.ozonApiKeyInput?.value || active.ozonApiKey || "").trim();
      active.ozonClientId = clientId;
      active.ozonApiKey = apiKey;
      persistCabinetsForCurrentUser();
      if (!clientId || !apiKey) {
        renderApiResult([{ name: "Ozon", ok: false, status: "-", detail: "Заполните Client ID и API Key." }], "Нет данных для загрузки.");
        return;
      }
      el.apiLoadStocksBtn.disabled = true;
      if (!options.silent) renderApiLoading("Загружаю остатки Ozon...");
      const res = await fetchBackendJson("/api/ozon/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, apiKey }),
      });
      if (!(res.available && res.ok && res.data?.ok)) {
        if (!options.silent) {
          renderApiResult(
            [{ name: "Ozon load", ok: false, status: res.status || "-", detail: String(res.data?.detail || res.data?.error || "Ошибка загрузки") }],
            "Не удалось загрузить данные Ozon."
          );
        }
        el.apiLoadStocksBtn.disabled = false;
        return;
      }
      const mappedRows = Array.isArray(res.data?.rows) ? res.data.rows : [];
      state.originalData = mappedRows;
      state.inTransitMap = {};
      state.dailyOrdersBySku = {};
      state.daysInReport = 30;
      state.lastDataUpdateAt = Date.now();
      // Если были сохранены CSV-заказы — переприменяем их поверх новых данных из API
      if (state.ozonOrdersCsvAgg) {
        applyOzonOrdersCsvAgg(state.ozonOrdersCsvAgg);
      }
      processData();
      runShipmentAnalysis();
      runAbcAnalysis();
      runRedistributionAnalysis();
      persistDataCacheForCurrentUser();
      activateTab("shipment");
      const csvNote = state.ozonOrdersCsvAgg ? " + CSV заказы применены" : "";
      el.status.textContent = `Данные загружены из Ozon API: ${mappedRows.length} строк.${csvNote}`;
      if (!options.silent) {
        const meta = res.data?.meta || {};
        const stockRows = Number(meta.rowsWithStock || 0);
        const orderRows = Number(meta.rowsWithOrders || 0);
        const salesRows = Number(meta.rowsWithSales || 0);
        const wd = meta.warehouseDiag || {};
        const unknownIds = Array.isArray(wd.unknownWarehouseIds) ? wd.unknownWarehouseIds : [];
        const eps = Array.isArray(wd.stockByWarehouseEndpoints) ? wd.stockByWarehouseEndpoints : [];
        const reportEps = Array.isArray(wd.reportWarehouseEndpoints) ? wd.reportWarehouseEndpoints : [];
        const whSamples = Array.isArray(wd.stockByWarehouseSamples) ? wd.stockByWarehouseSamples : [];
        const orderEps = Array.isArray(wd.ordersEndpoints) ? wd.ordersEndpoints : [];
        const orderAnalyticsEps = Array.isArray(wd.ordersAnalyticsEndpoints) ? wd.ordersAnalyticsEndpoints : [];
        const orderReportEps = Array.isArray(wd.ordersReportEndpoints) ? wd.ordersReportEndpoints : [];
        const orderPostingsEps = Array.isArray(wd.ordersPostingsEndpoints) ? wd.ordersPostingsEndpoints : [];
        const ordersCompare = wd.ordersCompare || {};
        const compareAnalytics = ordersCompare.analytics || {};
        const comparePostings = ordersCompare.postings || {};
        const compareReport = ordersCompare.report || {};
        const epText = eps
          .map((e) => `${e.endpoint}:${e.lastStatus}/${e.totalItems}`)
          .slice(0, 8)
          .join(" | ");
        const reportEpText = reportEps
          .map((e) => `${e.endpoint}:${e.status}${e.note ? `(${e.note})` : ""}`)
          .slice(0, 8)
          .join(" | ");
        const sampleText = whSamples
          .map((s) => `${s.endpoint} keys=[${(s.sampleKeys || []).slice(0, 8).join(",")}]`)
          .slice(0, 1)
          .join(" | ");
        const orderEpText = orderEps
          .map((e) => `${e.endpoint || "-"}:${e.status}:${e.metrics || "-"}:${e.dims || "-"}${e.note ? `(${e.note})` : ""}`)
          .slice(0, 8)
          .join(" | ");
        const orderAnalyticsText = orderAnalyticsEps
          .slice(Math.max(0, orderAnalyticsEps.length - 12))
          .map((e) => `${e.endpoint}:${e.status}:${e.metrics || "-"}:${e.dims || "-"}${e.note ? `(${e.note})` : ""}`)
          .join(" | ");
        const orderReportText = orderReportEps
          .map((e) => `${e.endpoint}:${e.status}${e.note ? `(${e.note})` : ""}`)
          .slice(0, 16)
          .join(" | ");
        const orderPostingsText = orderPostingsEps
          .slice(Math.max(0, orderPostingsEps.length - 12))
          .map((e) => `${e.endpoint}:${e.status}${e.note ? `(${e.note})` : ""}`)
          .join(" | ");
        renderApiResult(
          [
            {
              name: "Ozon load",
              ok: true,
              status: 200,
              detail:
                `rows: ${meta.rows || mappedRows.length}; products: ${meta.products || 0}; warehouses: ${meta.warehouses || 0}; ` +
                `withStock: ${stockRows}; withOrders: ${orderRows}; withSales: ${salesRows}; ` +
                `whStockProducts: ${Number(wd.warehouseStockProducts || 0)}; whStockUsed: ${Number(wd.usedWarehouseStocksEndpoint || 0)}; byKey: ${Number(wd.usedWarehouseStocksByKey || 0)}; ` +
                `whSource: ${String(wd.warehouseStockSource || "none")}; ` +
                `feedUsed: ${wd.usedFeedStocksEndpoint ? "yes" : "no"}; feedProducts: ${Number(wd.feedStockProducts || 0)}; ` +
                `mapById: ${Number(wd.mappedByWarehouseId || 0)}; idFallback: ${Number(wd.usedIdFallback || 0)}; ` +
                `ordersSource: ${String(wd.ordersSource || "analytics_api")}; ordersTotal: ${Number(wd.ordersTotalOrdered || 0)}; ordersMatched: ${Number(wd.ordersMatchedByPid || 0)}; ordersUnmatched: ${Number(wd.ordersUnmatchedRows || 0)}; ` +
                `cmpAnalytics: ordered=${Number(compareAnalytics.ordered || 0)}, bought=${Number(compareAnalytics.bought || 0)}, keys=${Number(compareAnalytics.keys || 0)}, inflated=${compareAnalytics.inflated ? "yes" : "no"}; ` +
                `cmpPostings: ordered=${Number(comparePostings.ordered || 0)}, bought=${Number(comparePostings.bought || 0)}, keys=${Number(comparePostings.keys || 0)}; ` +
                `cmpReport: ordered=${Number(compareReport.ordered || 0)}, bought=${Number(compareReport.bought || 0)}, keys=${Number(compareReport.keys || 0)}; ` +
                `unknownIds: ${unknownIds.slice(0, 10).join(", ") || "-"}; build:${String(wd.buildTag || "-")}; stockWhEP: ${epText || "-"}; reportEP: ${reportEpText || "-"}; sample: ${sampleText || "-"}; ordersEP: ${orderEpText || "-"}; ordersAnalytics: ${orderAnalyticsText || "-"}; ordersReport: ${orderReportText || "-"}; ordersPostings: ${orderPostingsText || "-"}`,
            },
          ],
          "Остатки Ozon загружены."
        );
      }
      el.apiLoadStocksBtn.disabled = false;
      return;
    }
    const token = (el.apiTokenInput?.value || getSavedApiTokenForCurrentUser() || "").trim();
    if (token && el.apiTokenInput && !el.apiTokenInput.value) el.apiTokenInput.value = token;
    const dateFrom = el.apiDateFrom?.value || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    if (!token) {
      renderApiResult([{ name: "Token", ok: false, detail: "Введите API токен." }], "Токен обязателен для загрузки.");
      return;
    }
    setSavedApiTokenForCurrentUser(token);

    el.apiLoadStocksBtn.disabled = true;
    if (!options.silent) {
      renderApiLoading("Загружаю остатки из API...");
    }

    const endpoint = {
      name: "Stocks",
      url: `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${encodeURIComponent(dateFrom)}`,
    };

    const result = await probeWbEndpoint(endpoint, token);
    if (!result.ok) {
      if (!options.silent) renderApiResult([result], "Не удалось загрузить остатки из API.");
      el.apiLoadStocksBtn.disabled = false;
      return;
    }

    const raw = Array.isArray(result.payload) ? result.payload : [];
    const ordersResult = await probeWbEndpoint(
      {
        name: "Orders",
        url: `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${encodeURIComponent(dateFrom)}`,
      },
      token
    );
    const salesResult = await probeWbEndpoint(
      {
        name: "Sales",
        url: `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${encodeURIComponent(dateFrom)}`,
      },
      token
    );
    const mappedRows = mapStocksOrdersSalesToRows(
      raw,
      Array.isArray(ordersResult.payload) ? ordersResult.payload : [],
      Array.isArray(salesResult.payload) ? salesResult.payload : []
    );
    state.dailyOrdersBySku = buildDailyOrdersBySku(Array.isArray(ordersResult.payload) ? ordersResult.payload : [], 14);
    await enrichRowsWithPublicNames(mappedRows);
    if (!mappedRows.length) {
      if (!options.silent) renderApiResult([result], "API ответил успешно, но остатков для отображения нет.");
      el.apiLoadStocksBtn.disabled = false;
      return;
    }

    state.originalData = mappedRows;
    state.inTransitMap = {};
    state.daysInReport = calcDaysSince(dateFrom);
    state.lastDataUpdateAt = Date.now();
    processData();
    runShipmentAnalysis();
    runAbcAnalysis();
    runRedistributionAnalysis();
    persistDataCacheForCurrentUser();
    activateTab("shipment");
    el.status.textContent = `Данные загружены из API Stocks+Orders+Sales: ${mappedRows.length} строк.`;
    if (!options.silent) {
      renderApiResult(
        [result, ordersResult, salesResult],
        "Остатки, заказы и продажи загружены из API. Процент выкупа рассчитан по каждому товару."
      );
    }
    el.apiLoadStocksBtn.disabled = false;
  }

  function mapStocksOrdersSalesToRows(stocks, orders, sales) {
    // Приводим данные Stocks + Orders + Sales к формату строк отчета (read-only источник).
    const aggregated = {};
    stocks.forEach((item) => {
      const sku = String(item.supplierArticle || "").trim();
      const warehouse = String(item.warehouseName || "").trim();
      const barcode = String(item.barcode || "").trim();
      if (!sku || !warehouse) return;
      const key = `${sku}__${barcode}__${warehouse}`;
      if (!aggregated[key]) {
        aggregated[key] = {
          sku,
          name: extractDisplayName(item, sku),
          category: extractCategory(item, sku),
          brand: extractBrand(item),
          nmId: toNum(item.nmId, 0),
          barcode,
          size: "N/A",
          warehouse,
          bought: 0,
          ordered: 0,
          stock: 0,
          revenue: 0,
          inTransit: 0,
          totalStock: 0,
          buyoutPercent: 0,
        };
      }
      aggregated[key].stock += Math.max(0, Math.round(toNum(item.quantity, 0)));
      const inWayToClient = Math.max(0, Math.round(toNum(item.inWayToClient, 0)));
      const inWayFromClient = Math.max(0, Math.round(toNum(item.inWayFromClient, 0)));
      aggregated[key].inTransit += inWayToClient + inWayFromClient;
    });

    orders.forEach((item) => {
      const sku = String(item.supplierArticle || "").trim();
      const warehouse = String(item.warehouseName || "").trim();
      const barcode = String(item.barcode || "").trim();
      if (!sku || !warehouse) return;
      const key = `${sku}__${barcode}__${warehouse}`;
      if (!aggregated[key]) {
        aggregated[key] = {
          sku,
          name: extractDisplayName(item, sku),
          category: extractCategory(item, sku),
          brand: extractBrand(item),
          nmId: toNum(item.nmId, 0),
          barcode,
          size: "N/A",
          warehouse,
          bought: 0,
          ordered: 0,
          stock: 0,
          revenue: 0,
          inTransit: 0,
          totalStock: 0,
          buyoutPercent: 0,
        };
      }
      aggregated[key].ordered += 1;
    });

    sales.forEach((item) => {
      const sku = String(item.supplierArticle || "").trim();
      const warehouse = String(item.warehouseName || "").trim();
      const barcode = String(item.barcode || "").trim();
      if (!sku || !warehouse) return;
      const key = `${sku}__${barcode}__${warehouse}`;
      if (!aggregated[key]) {
        aggregated[key] = {
          sku,
          name: extractDisplayName(item, sku),
          category: extractCategory(item, sku),
          brand: extractBrand(item),
          nmId: toNum(item.nmId, 0),
          barcode,
          size: "N/A",
          warehouse,
          bought: 0,
          ordered: 0,
          stock: 0,
          revenue: 0,
          inTransit: 0,
          totalStock: 0,
          buyoutPercent: 0,
        };
      }
      aggregated[key].bought += 1;
    });

    const rows = Object.values(aggregated);
    rows.forEach((row) => {
      row.totalStock = row.stock + row.inTransit;
      row.buyoutPercent = row.ordered > 0 ? (row.bought / row.ordered) * 100 : 0;
      row.name = normalizeProductName(row.name, row.sku, row.nmId);
    });
    return rows;
  }

  async function enrichRowsWithPublicNames(rows) {
    if (!Array.isArray(rows) || !rows.length) return;

    const byNmId = new Map();
    rows.forEach((row) => {
      const nmId = Math.max(0, Math.round(toNum(row.nmId, 0)));
      if (nmId > 0) {
        if (!byNmId.has(nmId)) byNmId.set(nmId, []);
        byNmId.get(nmId).push(row);
      }
    });
    if (!byNmId.size) return;

    const cache = getProductNameCacheForCurrentUser();
    const unresolvedNmIds = [];

    byNmId.forEach((items, nmId) => {
      const cachedName = String(cache[String(nmId)] || "").trim();
      if (cachedName) {
        items.forEach((row) => {
          row.name = normalizeProductName(cachedName, row.sku, row.nmId);
        });
        return;
      }
      const needsEnrichment = items.some((row) => shouldResolveName(row));
      if (needsEnrichment) unresolvedNmIds.push(nmId);
    });

    if (!unresolvedNmIds.length) return;

    // Ограничиваем одну волну запросов, чтобы интерфейс не подвисал на больших кабинетах.
    const idsForLookup = unresolvedNmIds.slice(0, 2000);
    const resolvedMap = await fetchNamesByNmIds(idsForLookup);
    if (!resolvedMap.size) return;

    idsForLookup.forEach((nmId) => {
      const name = String(resolvedMap.get(nmId) || "").trim();
      if (!name) return;
      cache[String(nmId)] = name;
      const items = byNmId.get(nmId) || [];
      items.forEach((row) => {
        row.name = normalizeProductName(name, row.sku, row.nmId);
      });
    });

    saveProductNameCacheForCurrentUser(cache);
  }

  async function fetchNamesByNmIds(nmIds) {
    const result = new Map();
    if (!Array.isArray(nmIds) || !nmIds.length) return result;

    await fetchNamesFromCardDetail(nmIds, result);
    const missing = nmIds.filter((id) => !result.has(id));
    if (missing.length) {
      await fetchNamesFromBasketCard(missing.slice(0, 200), result);
    }
    return result;
  }

  async function fetchNamesFromCardDetail(nmIds, outMap) {
    const chunks = chunkArray(nmIds, 100);
    for (const chunk of chunks) {
      const url =
        "https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&nm=" + encodeURIComponent(chunk.join(";"));
      const payload = await fetchJsonWithTimeout(url, 12000);
      if (!payload || !payload.data || !Array.isArray(payload.data.products)) continue;

      payload.data.products.forEach((product) => {
        const nmId = Math.max(0, Math.round(toNum(product?.id ?? product?.nmId, 0)));
        if (!nmId || outMap.has(nmId)) return;
        const name = extractNameFromProductCard(product);
        if (name) outMap.set(nmId, name);
      });
    }
  }

  async function fetchNamesFromBasketCard(nmIds, outMap) {
    const workers = nmIds.map((nmId) => async () => {
      if (outMap.has(nmId)) return;
      const vol = Math.floor(nmId / 100000);
      const part = Math.floor(nmId / 1000);
      const basketHost = "https://basket-01.wbbasket.ru";
      const url = `${basketHost}/vol${vol}/part${part}/${nmId}/info/ru/card.json`;
      const payload = await fetchJsonWithTimeout(url, 8000);
      if (!payload || typeof payload !== "object") return;
      const name = extractNameFromProductCard(payload);
      if (name) outMap.set(nmId, name);
    });
    await runWithConcurrency(workers, 8);
  }

  async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  function extractNameFromProductCard(source = {}) {
    const candidates = [
      source.nmName,
      source.name,
      source.imt_name,
      source.goodsName,
      source.title,
    ];
    for (const raw of candidates) {
      const clean = String(raw || "").trim();
      if (!clean) continue;
      if (/^товар\s*#\d+$/i.test(clean)) continue;
      return clean;
    }
    return "";
  }

  async function runWithConcurrency(tasks, limit) {
    if (!Array.isArray(tasks) || !tasks.length) return;
    const width = Math.max(1, Math.round(toNum(limit, 1)));
    let cursor = 0;
    const workers = new Array(Math.min(width, tasks.length)).fill(0).map(async () => {
      while (cursor < tasks.length) {
        const index = cursor;
        cursor += 1;
        try {
          await tasks[index]();
        } catch {
          // Ignore single-card fetch errors to keep UI responsive.
        }
      }
    });
    await Promise.all(workers);
  }

  function chunkArray(arr, chunkSize) {
    const out = [];
    const size = Math.max(1, Math.round(toNum(chunkSize, 1)));
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  async function probeWbEndpoint(endpoint, token) {
    const backendResult = await probeWbEndpointViaBackend(endpoint, token);
    if (backendResult) return backendResult;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const resp = await fetch(endpoint.url, {
        method: "GET",
        headers: { Authorization: token },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      let data = null;
      let text = "";
      try {
        data = await resp.json();
      } catch {
        text = await resp.text();
      }

      if (!resp.ok) {
        const detail = getErrorDetail(data, text, resp.status);
        return { name: endpoint.name, ok: false, status: resp.status, detail };
      }

      const stats = describePayload(data);
      return {
        name: endpoint.name,
        ok: true,
        status: resp.status,
        detail: `rows: ${stats.count}; fields: ${stats.keys}`,
        payload: data,
      };
    } catch (error) {
      clearTimeout(timeout);
      const message = classifyFetchError(error);
      return { name: endpoint.name, ok: false, status: "-", detail: message };
    }
  }

  async function probeWbEndpointViaBackend(endpoint, token) {
    const res = await fetchBackendJson("/api/wb/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: endpoint.url, token }),
    });
    if (!(res.available && res.ok && res.data?.proxy === "wb")) return null;

    const data = res.data || {};
    if (!data.ok) {
      const detail = String(data.detail || "");
      if ((data.status ?? "-") === "-" && !["token_required", "unsupported_wb_url"].includes(detail)) return null;
      return {
        name: endpoint.name,
        ok: false,
        status: data.status ?? "-",
        detail: String(detail || getErrorDetail(data.payload, "", data.status) || "Ошибка proxy"),
      };
    }

    const stats = describePayload(data.payload);
    return {
      name: endpoint.name,
      ok: true,
      status: data.status ?? 200,
      detail: `rows: ${stats.count}; fields: ${stats.keys}`,
      payload: data.payload,
    };
  }

  function describePayload(data) {
    if (Array.isArray(data)) {
      const count = data.length;
      const keys = count ? Object.keys(data[0]).slice(0, 8).join(", ") : "none";
      return { count, keys };
    }
    if (data && typeof data === "object") {
      return { count: 1, keys: Object.keys(data).slice(0, 8).join(", ") || "none" };
    }
    return { count: 0, keys: "none" };
  }

  function getErrorDetail(json, text, status) {
    if (json && typeof json === "object") {
      if (typeof json.message === "string") return json.message;
      if (typeof json.error === "string") return json.error;
      if (typeof json.detail === "string") return json.detail;
    }
    if (text) return text.slice(0, 180);
    if (status === 401 || status === 403) return "Нет доступа: проверьте токен и права.";
    if (status === 429) return "Лимит запросов (429).";
    return `HTTP ${status}`;
  }

  function classifyFetchError(error) {
    const msg = String(error?.message || "");
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return "Браузер заблокировал запрос (CORS/сеть). Для точного теста нужен backend proxy.";
    }
    if (msg.includes("aborted")) return "Таймаут запроса.";
    return msg || "Ошибка запроса.";
  }

  function buildApiSummary(results) {
    const okCount = results.filter((r) => r.ok).length;
    if (okCount === results.length) return "Токен рабочий: все read-only endpoint ответили успешно.";
    if (okCount > 0) return `Частичный доступ: успешно ${okCount}/${results.length}.`;
    const hasCors = results.some((r) => String(r.detail).toLowerCase().includes("cors"));
    if (hasCors) return "Доступ не подтвержден из браузера из-за CORS. Токен лучше проверить через backend proxy.";
    return "Токен не дал успешных ответов. Проверьте права и формат.";
  }

  function renderApiLoading(message) {
    if (!el.apiTestResult) return;
    el.apiTestResult.classList.remove("empty");
    el.apiTestResult.innerHTML = message || "Проверка API...";
  }

  function renderApiResult(results, summary) {
    if (!el.apiTestResult) return;
    el.apiTestResult.classList.remove("empty");
    if (!results.length) {
      el.apiTestResult.textContent = summary || "Нет данных.";
      return;
    }
    let html = `<div style="margin-bottom:8px;"><b>${escapeHtml(summary || "")}</b></div>`;
    html += "<table><thead><tr><th>Endpoint</th><th>Status</th><th>Detail</th></tr></thead><tbody>";
    for (const row of results) {
      const cls = row.ok ? "api-ok" : "api-fail";
      const statusText = row.ok ? "OK" : "FAIL";
      html += `<tr>
        <td>${escapeHtml(row.name)}</td>
        <td class="${cls}">${statusText} ${escapeHtml(String(row.status ?? "-"))}</td>
        <td>${escapeHtml(String(row.detail || ""))}</td>
      </tr>`;
    }
    html += "</tbody></table>";
    el.apiTestResult.innerHTML = html;
  }

  function importManualCsv(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsvText(String(reader.result || ""));
        const normalized = rows
          .map((r) => ({
            sku: String(r.sku || "").trim(),
            name: String(r.name || "").trim(),
            barcode: String(r.barcode || "").trim(),
            size: String(r.size || "N/A").trim(),
            warehouse: String(r.warehouse || "").trim(),
            stock: toNum(r.stock, 0),
            bought: toNum(r.bought, 0),
            ordered: toNum(r.ordered, 0),
            revenue: toNum(r.revenue, 0),
          }))
          .filter((r) => r.sku && r.warehouse);
        state.originalData = normalized;
        state.inTransitMap = {};
        state.dailyOrdersBySku = {};
        state.ozonOrdersCsvAgg = null;
        state.daysInReport = 30;
        el.status.textContent = `Импортировано из CSV: ${normalized.length} строк`;
        processData();
        runShipmentAnalysis();
        runAbcAnalysis();
        runRedistributionAnalysis();
        persistDataCacheForCurrentUser();
        updateClearOzonCsvBtnVisibility();
      } catch (error) {
        alert("Ошибка импорта CSV: " + error.message);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function importOzonStocksXlsx(event) {
    const file = event.target.files[0];
    if (!file) return;
    const active = getActiveCabinet();
    if (active?.platform !== "ozon") {
      alert("XLSX остатков можно применить только к кабинету Ozon.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        // Ищем строку-заголовок: первая строка, где col0 содержит "артикул"
        let headerIdx = -1;
        for (let i = 0; i < Math.min(raw.length, 10); i++) {
          const firstCell = String(raw[i]?.[0] || "").toLowerCase().replace(/\xa0/g, " ").trim();
          if (firstCell === "артикул" || firstCell === "номер артикула") {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx === -1) {
          alert("Не удалось найти заголовок 'Артикул' в XLSX файле.");
          return;
        }

        // Определяем индексы столбцов по заголовкам.
        // XLSX имеет объединённые ячейки: Row 0 — группы ("Остатки на складах Ozon"),
        // Row 1 — конкретные столбцы ("Доступно к продаже"). Объединяем оба ряда.
        const row0 = (raw[headerIdx] || []).map((v) =>
          String(v || "").toLowerCase().replace(/\xa0/g, " ").replace(/\s+/g, " ").trim()
        );
        const row1 = headerIdx + 1 < raw.length
          ? (raw[headerIdx + 1] || []).map((v) =>
              String(v || "").toLowerCase().replace(/\xa0/g, " ").replace(/\s+/g, " ").trim()
            )
          : [];
        const headers = row0.map((h, i) => (h && h !== "" ? h : (row1[i] || "")));
        // Также ищем в sub-headers отдельно для столбцов со stock-данными
        const colIdx = (names) => {
          for (const n of names) {
            let idx = headers.findIndex((h) => h.includes(n));
            if (idx >= 0) return idx;
            idx = row1.findIndex((h) => h && h.includes(n));
            if (idx >= 0) return idx;
          }
          return -1;
        };
        const iArticle = colIdx(["артикул", "номер артикула"]);
        const iName = colIdx(["название товара", "название"]);
        const iSku = colIdx(["sku", "номер sku"]);
        const iWarehouse = colIdx(["склад"]);
        const iAvailable = colIdx(["доступно к продаже", "доступно"]);
        const iPreparing = colIdx(["готовим к продаже"]);
        const iInRequests = colIdx(["в заявках на поставку"]);
        const iInTransit = colIdx(["в поставках в пути"]);
        const iReturns = colIdx(["возвращаются от покупателей", "возвращаются"]);

        // Пропускаем строки-описания (после заголовка: sub-headers, "Нередактируемое", пояснения)
        let dataStart = headerIdx + 1;
        for (let i = dataStart; i < Math.min(raw.length, dataStart + 10); i++) {
          const rowCells = (raw[i] || []).map((v) => String(v || "").trim());
          const firstCell = rowCells[0].toLowerCase();
          const isSubHeader = !firstCell && rowCells.some((v) => v.length > 0);
          const isEditMark = firstCell === "нередактируемое";
          const hasLongDesc = rowCells.some((v) => v.length > 50);
          const matchesHeader = firstCell.includes("артикул") || firstCell.includes("номер");
          if (isSubHeader || isEditMark || hasLongDesc || matchesHeader) {
            dataStart = i + 1;
          } else if (firstCell) {
            break;
          }
        }

        const rows = [];
        for (let i = dataStart; i < raw.length; i++) {
          const r = raw[i];
          const article = String(r[iArticle] || "").trim();
          if (!article) continue;
          const name = String(r[iName >= 0 ? iName : 1] || "").trim();
          const sku = iSku >= 0 ? Number(r[iSku]) || 0 : 0;
          const warehouse = iWarehouse >= 0 ? String(r[iWarehouse] || "").trim() : "Ozon склад";
          const available = iAvailable >= 0 ? Math.max(0, Number(r[iAvailable]) || 0) : 0;
          const preparing = iPreparing >= 0 ? Math.max(0, Number(r[iPreparing]) || 0) : 0;
          const inRequests = iInRequests >= 0 ? Math.max(0, Number(r[iInRequests]) || 0) : 0;
          const inTransitVal = iInTransit >= 0 ? Math.max(0, Number(r[iInTransit]) || 0) : 0;
          const returns = iReturns >= 0 ? Math.max(0, Number(r[iReturns]) || 0) : 0;

          const stock = available + preparing;
          const inTransit = inTransitVal + inRequests + returns;

          rows.push({
            sku: article,
            name: name || `Ozon #${article}`,
            category: "Ozon",
            brand: "—",
            nmId: sku,
            barcode: "",
            size: "N/A",
            warehouse: warehouse || "Ozon склад",
            bought: 0,
            ordered: 0,
            stock: Math.round(stock),
            revenue: 0,
            inTransit: Math.round(inTransit),
            totalStock: Math.round(stock + inTransit),
            buyoutPercent: 0,
          });
        }

        if (!rows.length) {
          alert("В XLSX файле не найдено строк с остатками.");
          return;
        }

        state.originalData = rows;
        state.inTransitMap = {};
        state.dailyOrdersBySku = {};
        state.daysInReport = 30;
        state.lastDataUpdateAt = Date.now();

        if (state.ozonOrdersCsvAgg) {
          applyOzonOrdersCsvAgg(state.ozonOrdersCsvAgg);
        }

        processData();
        runShipmentAnalysis();
        runAbcAnalysis();
        runRedistributionAnalysis();
        persistDataCacheForCurrentUser();
        activateTab("shipment");

        const totalStock = rows.reduce((s, r) => s + r.stock, 0);
        const totalInTransit = rows.reduce((s, r) => s + r.inTransit, 0);
        const uniqueProducts = new Set(rows.map((r) => r.sku)).size;
        const uniqueWarehouses = new Set(rows.map((r) => r.warehouse)).size;
        const csvNote = state.ozonOrdersCsvAgg ? " + CSV заказы применены" : "";

        el.status.textContent =
          `Остатки Ozon XLSX: ${rows.length} строк, ${uniqueProducts} товаров, ${uniqueWarehouses} складов, ` +
          `остаток ${totalStock}, в пути ${totalInTransit}.${csvNote}`;

        renderApiResult(
          [{
            name: "Ozon stocks XLSX",
            ok: true,
            status: 200,
            detail:
              `rows: ${rows.length}; products: ${uniqueProducts}; warehouses: ${uniqueWarehouses}; ` +
              `totalStock: ${totalStock}; totalInTransit: ${totalInTransit}`,
          }],
          "Остатки Ozon загружены из XLSX файла."
        );
      } catch (error) {
        alert("Ошибка импорта остатков Ozon XLSX: " + error.message);
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function importOzonOrdersCsv(event) {
    const file = event.target.files[0];
    if (!file) return;
    const active = getActiveCabinet();
    if (active?.platform !== "ozon") {
      alert("CSV заказов Ozon можно применить только к кабинету Ozon.");
      event.target.value = "";
      return;
    }
    if (!state.originalData.length) {
      alert("Сначала загрузите остатки Ozon (XLSX), чтобы было к чему привязать заказы.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsvText(String(reader.result || ""));
        const agg = buildOzonOrdersCsvAgg(rows);
        state.ozonOrdersCsvAgg = agg;
        const result = applyOzonOrdersCsvAgg(agg);
        state.daysInReport = 30;
        state.dailyOrdersBySku = {};
        el.status.textContent =
          `Заказы Ozon из CSV: строк ${result.sourceRows}, заказано ${result.totalOrdered}, выкуплено ${result.totalBought}, ` +
          `обновлено строк ${result.updatedRows}.`;
        processData();
        runShipmentAnalysis();
        runAbcAnalysis();
        runRedistributionAnalysis();
        persistDataCacheForCurrentUser();
        updateClearOzonCsvBtnVisibility();
        renderApiResult(
          [
            {
              name: "Ozon orders CSV",
              ok: true,
              status: 200,
              detail:
                `sourceRows: ${result.sourceRows}; totalOrdered: ${result.totalOrdered}; totalBought: ${result.totalBought}; ` +
                `updatedRows: ${result.updatedRows}; unmatchedRows: ${result.unmatchedRows}`,
            },
          ],
          "Заказы Ozon применены из CSV."
        );
      } catch (error) {
        alert("Ошибка импорта заказов Ozon CSV: " + error.message);
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function updateClearOzonCsvBtnVisibility() {
    if (!el.clearOzonCsvBtn) return;
    const active = getActiveCabinet();
    el.clearOzonCsvBtn.style.display = (active?.platform === "ozon" && state.ozonOrdersCsvAgg) ? "inline-flex" : "none";
  }

  function clearOzonOrdersCsv() {
    state.ozonOrdersCsvAgg = null;
    state.originalData.forEach((row) => {
      row.ordered = 0;
      row.bought = 0;
    });
    persistDataCacheForCurrentUser();
    updateClearOzonCsvBtnVisibility();
    processData();
    runShipmentAnalysis();
    runAbcAnalysis();
    runRedistributionAnalysis();
    el.status.textContent = "CSV заказы Ozon сброшены.";
  }

  // Парсит сырые CSV-строки и возвращает компактный агрегат для хранения.
  // Вместо тысяч строк CSV — только словарь {ключ → {ordered, bought}}.
  function buildOzonOrdersCsvAgg(csvRows) {
    const specific = {};  // "артикул__склад" → {ordered, bought}
    const global = {};   // "артикул" → {ordered, bought}
    const siblings = {}; // ключ → Set(связанные ключи) для предотвращения двойного счёта
    let sourceRows = 0;
    let totalOrdered = 0;
    let totalBought = 0;

    const addTo = (obj, key, ordered, bought) => {
      if (!key) return;
      if (!obj[key]) obj[key] = { ordered: 0, bought: 0 };
      obj[key].ordered += ordered;
      obj[key].bought += bought;
    };

    (csvRows || []).forEach((row) => {
      const qty = Math.max(0, Math.round(toNum(
        getCsvField(row, [
          "количество", "quantity", "qty", "кол-во",
          "кол-во в отправлении", "количество в отправлении",
          "количество единиц", "items", "item_count",
        ]), 0
      )));
      if (qty <= 0) return;

      const status = normalizeCsvToken(getCsvField(row, [
        "статус", "status", "статус отправления", "posting_status", "order_status",
      ]));

      // "Артикул" в выгрузке Ozon — артикул продавца (supplierArticle/offer_id).
      // "SKU" — внутренний Ozon FBO SKU (соответствует nmId в API).
      const article = normalizeCsvToken(getCsvField(row, [
        "артикул", "offer_id", "offer id", "артикул продавца",
        "vendor_code", "seller_sku", "sku продавца",
      ]));
      const ozonSku = normalizeCsvToken(getCsvField(row, [
        "ozon id", "ozon_id", "озон id", "fbo sku", "fbo_sku",
        "озон sku", "ozon sku", "sku",
      ]));
      const warehouse = normalizeCsvToken(getCsvField(row, [
        "склад отгрузки", "склад", "warehouse", "warehouse_name",
        "склад отправления", "название склада",
      ]));
      const buyoutRaw = normalizeCsvToken(getCsvField(row, [
        "выкуп товара", "выкуп", "bought", "buyout", "статус выкупа", "is_delivered",
      ]));
      const bought = isOzonCsvBought(buyoutRaw, status) ? qty : 0;
      const keys = [...new Set([article, ozonSku].filter(Boolean))];
      if (!keys.length) return;

      sourceRows += 1;
      totalOrdered += qty;
      totalBought += bought;
      keys.forEach((key) => {
        addTo(global, key, qty, bought);
        if (warehouse) addTo(specific, `${key}__${warehouse}`, qty, bought);
      });
      // Связываем артикул и SKU как синонимы для предотвращения двойного счёта
      if (keys.length > 1) {
        keys.forEach((k) => {
          if (!siblings[k]) siblings[k] = [];
          keys.forEach((k2) => { if (k2 !== k && !siblings[k].includes(k2)) siblings[k].push(k2); });
        });
      }
    });

    return { specific, global, sourceRows, totalOrdered, totalBought, siblings };
  }

  // Применяет готовый агрегат к state.originalData.
  function applyOzonOrdersCsvAgg(agg) {
    if (!agg) return { sourceRows: 0, totalOrdered: 0, totalBought: 0, updatedRows: 0, unmatchedRows: 0 };
    const { specific = {}, global = {}, sourceRows = 0, totalOrdered = 0, totalBought = 0, siblings = {} } = agg;

    const getAgg = (obj, keys) => {
      for (const k of keys) { if (obj[k]) return obj[k]; }
      return null;
    };

    state.originalData.forEach((row) => { row.ordered = 0; row.bought = 0; });

    const specificApplied = new Set();
    let updatedRows = 0;

    state.originalData.forEach((row, idx) => {
      const warehouse = normalizeCsvToken(row.warehouse);
      const lookupKeys = getOzonRowOrderKeys(row).map((k) => `${k}__${warehouse}`);
      const found = getAgg(specific, lookupKeys);
      if (!found) return;
      row.ordered = Math.max(0, Math.round(found.ordered || 0));
      row.bought = Math.max(0, Math.round(found.bought || 0));
      specificApplied.add(idx);
      updatedRows += 1;
    });

    const groups = new Map();
    state.originalData.forEach((row, idx) => {
      const groupKey = normalizeCsvToken(row.sku || row.nmId || row.barcode);
      if (!groupKey) return;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push({ row, idx });
    });

    groups.forEach((items) => {
      const hasSpecific = items.some((item) => specificApplied.has(item.idx));
      const found = getAgg(global, getOzonRowOrderKeys(items[0]?.row));
      if (!found) return;

      if (!hasSpecific) {
        // Группа без специфичных совпадений — распределяем всё по остаткам
        distributeOzonOrdersToRows(items.map((item) => item.row), found);
        updatedRows += items.length;
        return;
      }
      // Группа частично совпала по складам — распределяем остаток
      const appliedOrdered = items.reduce((s, item) => s + Math.max(0, toNum(item.row.ordered, 0)), 0);
      const appliedBought = items.reduce((s, item) => s + Math.max(0, toNum(item.row.bought, 0)), 0);
      const remainOrdered = Math.max(0, Math.round(found.ordered || 0) - appliedOrdered);
      const remainBought = Math.max(0, Math.round(found.bought || 0) - appliedBought);
      if (remainOrdered <= 0 && remainBought <= 0) return;
      // Добавляем остаток к строкам без специфичного совпадения, или ко всем пропорционально
      const unmatched = items.filter((item) => !specificApplied.has(item.idx));
      const targets = unmatched.length ? unmatched : items;
      const totalWeight = targets.reduce((s, item) => s + Math.max(0, toNum(item.row.totalStock, 0)), 0);
      let orderedLeft = remainOrdered;
      let boughtLeft = remainBought;
      targets.forEach((item, i) => {
        if (i === targets.length - 1) {
          item.row.ordered += orderedLeft;
          item.row.bought += boughtLeft;
          return;
        }
        const w = totalWeight > 0 ? Math.max(0, toNum(item.row.totalStock, 0)) / totalWeight : 1 / Math.max(1, targets.length);
        const addO = Math.max(0, Math.round(remainOrdered * w));
        const addB = Math.max(0, Math.round(remainBought * w));
        item.row.ordered += addO;
        item.row.bought += addB;
        orderedLeft -= addO;
        boughtLeft -= addB;
      });
      updatedRows += targets.length;
    });

    // Создаём строки для артикулов из CSV, которых нет в остатках XLSX
    const existingKeys = new Set();
    state.originalData.forEach((row) => {
      getOzonRowOrderKeys(row).forEach((k) => existingKeys.add(k));
    });
    const handledUnmatched = new Set();
    Object.entries(global).forEach(([key, val]) => {
      if (existingKeys.has(key) || handledUnmatched.has(key)) return;
      const ordered = Math.max(0, Math.round(val.ordered || 0));
      const bought = Math.max(0, Math.round(val.bought || 0));
      if (ordered <= 0 && bought <= 0) return;
      state.originalData.push({
        sku: key,
        name: `Ozon #${key}`,
        category: "Ozon",
        brand: "—",
        nmId: 0,
        barcode: "",
        size: "N/A",
        warehouse: "Ozon (нет остатков)",
        bought,
        ordered,
        stock: 0,
        revenue: 0,
        inTransit: 0,
        totalStock: 0,
        buyoutPercent: 0,
      });
      existingKeys.add(key);
      handledUnmatched.add(key);
      // Помечаем связанные ключи (article↔SKU) как обработанные
      (siblings[key] || []).forEach((sib) => handledUnmatched.add(sib));
      updatedRows += 1;
    });

    const rowsOrdered = state.originalData.reduce((sum, row) => sum + Math.max(0, toNum(row.ordered, 0)), 0);
    return {
      sourceRows,
      totalOrdered: Math.round(totalOrdered),
      totalBought: Math.round(totalBought),
      updatedRows,
      unmatchedRows: Math.max(0, Math.round(totalOrdered - rowsOrdered)),
    };
  }

  function distributeOzonOrdersToRows(rows, agg) {
    const totalOrdered = Math.max(0, Math.round(toNum(agg?.ordered, 0)));
    const totalBought = Math.max(0, Math.round(toNum(agg?.bought, 0)));
    const totalWeight = rows.reduce((sum, row) => sum + Math.max(0, toNum(row.totalStock, 0)), 0);
    let orderedLeft = totalOrdered;
    let boughtLeft = totalBought;
    rows.forEach((row, idx) => {
      if (idx === rows.length - 1) {
        row.ordered = orderedLeft;
        row.bought = boughtLeft;
        return;
      }
      const weight = totalWeight > 0 ? Math.max(0, toNum(row.totalStock, 0)) / totalWeight : 1 / Math.max(1, rows.length);
      const ordered = Math.max(0, Math.round(totalOrdered * weight));
      const bought = Math.max(0, Math.round(totalBought * weight));
      row.ordered = ordered;
      row.bought = bought;
      orderedLeft -= ordered;
      boughtLeft -= bought;
    });
  }

  function firstAggForKeys(map, keys) {
    for (const key of keys || []) {
      const agg = map.get(key);
      if (agg) return agg;
    }
    return null;
  }

  function getOzonRowOrderKeys(row) {
    // row.nmId может быть числом — явно приводим к строке перед normalizeCsvToken
    const nmIdStr = (row?.nmId != null && row.nmId !== 0) ? String(row.nmId) : "";
    return [...new Set([row?.sku, nmIdStr, row?.barcode].map(normalizeCsvToken).filter(Boolean))];
  }

  function getCsvField(row, keys) {
    for (const key of keys) {
      const normalizedKey = normalizeCsvHeader(key);
      if (Object.prototype.hasOwnProperty.call(row, normalizedKey)) return row[normalizedKey];
    }
    return "";
  }

  function normalizeCsvHeader(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/^"|"$/g, "")
      .trim()
      .toLowerCase();
  }

  function normalizeCsvToken(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/^"|"$/g, "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ");
  }

  function isOzonCsvBought(buyoutRaw, status) {
    if (["да", "yes", "true", "1", "выкуп", "выкуплен", "выкуплено"].includes(buyoutRaw)) return true;
    if (["нет", "no", "false", "0"].includes(buyoutRaw)) return false;
    return status.includes("deliver") || status.includes("доставлен") || status.includes("доставляет");
  }

  function applySkuListSettingsFromControls() {
    const raw = String(el.settingsSkuList?.value || "");
    const skuList = parseSkuListText(raw);
    state.excludedSkus = new Set(skuList.map(normalizeSkuToken).filter(Boolean));
    state.useOnlySkuList = !!el.settingsUseOnlySkuList?.checked;
    persistUserSettingsForCurrentUser();
    processData();
    runShipmentAnalysis();
    runAbcAnalysis();
    runRedistributionAnalysis();
  }

  function parseSkuListText(text) {
    const parts = String(text || "")
      .replace(/;/g, "\n")
      .replace(/,/g, "\n")
      .split(/\r?\n/)
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    return [...new Set(parts)];
  }

  async function handleSalesPlanUpload(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      const planMap = await parseSalesPlanXlsx(file);
      state.salesPlanMap = planMap;
      persistUserSettingsForCurrentUser();
      renderSalesPlanStatus(file.name);
      runShipmentAnalysis();
    } catch (error) {
      alert("Ошибка чтения плана продаж: " + error.message);
    } finally {
      if (el.settingsSalesPlanInput) el.settingsSalesPlanInput.value = "";
    }
  }

  async function parseSalesPlanXlsx(file) {
    const workbook = await readWorkbook(file);
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!Array.isArray(raw) || raw.length < 2) {
      throw new Error("Файл плана пустой.");
    }
    const header = raw[0].map(normalizeHeader);
    const skuIdx = header.findIndex((h) => h.includes("артикул") || h === "sku");
    const planIdx = header.findIndex((h) => h.includes("план") || h.includes("qty") || h.includes("кол"));
    if (skuIdx < 0 || planIdx < 0) {
      throw new Error('В плане нужны 2 колонки: "артикул" и "план".');
    }
    const out = {};
    raw.slice(1).forEach((row) => {
      const sku = normalizeSkuToken(row[skuIdx]);
      const qty = Math.max(0, Math.round(toNum(row[planIdx], 0)));
      if (!sku) return;
      out[sku] = qty;
    });
    return out;
  }

  function renderSalesPlanStatus(fileName = "") {
    if (!el.settingsSalesPlanStatus) return;
    const count = Object.keys(state.salesPlanMap || {}).length;
    if (!count) {
      el.settingsSalesPlanStatus.textContent = "План продаж не загружен.";
      return;
    }
    const suffix = fileName ? ` (${fileName})` : "";
    el.settingsSalesPlanStatus.textContent = `Загружен план продаж: ${count} артикулов${suffix}.`;
  }

  async function parseSalesXlsx(file) {
    const workbook = await readWorkbook(file);
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const headerIndex = findHeaderRow(raw);
    if (headerIndex < 0) throw new Error("Не найдена строка заголовков в отчете.");
    const headers = raw[headerIndex].map(normalizeHeader);
    const rows = raw.slice(headerIndex + 1).map((cells) => toSalesRow(headers, cells)).filter((r) => r.sku && r.warehouse);
    return { rows, daysInReport: parseDaysFromFilename(file.name) };
  }

  async function parseShipmentXlsx(file) {
    const workbook = await readWorkbook(file);
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const headerIndex = findHeaderRow(raw);
    if (headerIndex < 0) throw new Error(`Не найдена строка заголовков в файле поставок: ${file.name}`);
    const headers = raw[headerIndex].map(normalizeHeader);
    return raw
      .slice(headerIndex + 1)
      .map((cells) => {
        const row = mapByHeaders(headers, cells);
        return {
          barcode: String(row["баркод"] || "").trim(),
          warehouse: String(row["склад"] || "").trim(),
          size: String(row["размер"] || "N/A").trim(),
          quantity: Math.max(0, Math.round(toNum(row["кол-во для поставки"], 0))),
        };
      })
      .filter((r) => r.barcode && r.warehouse && r.quantity > 0);
  }

  async function readWorkbook(file) {
    const buffer = await file.arrayBuffer();
    return XLSX.read(new Uint8Array(buffer), { type: "array" });
  }

  function findHeaderRow(rows) {
    for (let i = 0; i < rows.length; i += 1) {
      const normalized = rows[i].map(normalizeHeader);
      if (
        normalized.some((x) => x.includes("артикул продавца") || x.includes("кол-во для поставки")) &&
        normalized.some((x) => x.includes("склад"))
      ) {
        return i;
      }
    }
    return -1;
  }

  function toSalesRow(headers, cells) {
    const row = mapByHeaders(headers, cells);
    return {
      sku: String(row["артикул продавца"] || "").trim(),
      name: String(row["наименование"] || "").trim(),
      barcode: String(row["баркод"] || "").trim(),
      size: String(row["размер"] || "N/A").trim(),
      warehouse: String(row["склад"] || "").trim(),
      bought: Math.max(0, Math.round(toNum(row["выкупили, шт."], 0))),
      ordered: Math.max(0, Math.round(toNum(row["шт."], 0))),
      stock: Math.max(0, Math.round(toNum(row["текущий остаток, шт."], 0))),
      revenue: toNum(row["к перечислению за товар, руб."], 0),
      inTransit: 0,
      totalStock: 0,
    };
  }

  function mapByHeaders(headers, cells) {
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx];
    });
    return row;
  }

  function parseDaysFromFilename(name) {
    const match = String(name).match(/(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})/);
    if (!match) return 30;
    const start = new Date(match[1]);
    const end = new Date(match[2]);
    const diff = (end - start) / (1000 * 60 * 60 * 24);
    if (!Number.isFinite(diff) || diff < 0) return 30;
    return Math.round(diff) + 1;
  }

  function calcDaysSince(dateFrom) {
    const from = new Date(dateFrom);
    if (!Number.isFinite(from.getTime())) return 30;
    const now = new Date();
    from.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diff = (now - from) / 86400000;
    return diff >= 0 ? Math.max(1, Math.floor(diff) + 1) : 30;
  }

  function toLocalDateKey(value) {
    const dt = new Date(value);
    if (!Number.isFinite(dt.getTime())) return "";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getLastDaysKeys(days = 14) {
    const out = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i -= 1) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() - i);
      out.push(toLocalDateKey(dt));
    }
    return out;
  }

  function buildDailyOrdersBySku(orders, lastDays = 14) {
    const out = {};
    const allowedDates = new Set(getLastDaysKeys(lastDays));
    (orders || []).forEach((item) => {
      const sku = String(item?.supplierArticle || "").trim();
      if (!sku) return;
      const dateKey = toLocalDateKey(item?.date || item?.lastChangeDate);
      if (!dateKey || !allowedDates.has(dateKey)) return;
      const qty = Math.max(
        1,
        Math.round(
          toNum(
            item?.quantity ??
              item?.qty ??
              item?.count ??
              item?.items_count ??
              item?.forPay ??
              item?.forpay ??
              1,
            1
          )
        )
      );
      if (!out[sku]) out[sku] = {};
      out[sku][dateKey] = toNum(out[sku][dateKey], 0) + qty;
    });
    return out;
  }

  function getTurnoverCellClass(days) {
    if (days < 20) return "turnover-cell turnover-cell-low";
    if (days > 45) return "turnover-cell turnover-cell-high";
    return "turnover-cell turnover-cell-mid";
  }

  function parseCsvText(text) {
    const records = splitCsvRecords(String(text || ""));
    if (records.length < 2) throw new Error("CSV пустой.");
    const sep = records[0].includes(";") ? ";" : ",";
    const headers = splitCsvLine(records[0], sep).map(normalizeCsvHeader);
    return records.slice(1).map((line) => {
      const values = splitCsvLine(line, sep);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? "";
      });
      return row;
    });
  }

  function splitCsvRecords(text) {
    const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const records = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < normalized.length; i += 1) {
      const ch = normalized[i];
      const next = normalized[i + 1];
      if (ch === '"' && inQuotes && next === '"') {
        current += '""';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        current += ch;
        continue;
      }
      if (ch === "\n" && !inQuotes) {
        if (current.trim()) records.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) records.push(current);
    return records;
  }

  function splitCsvLine(line, sep) {
    const out = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < String(line || "").length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === sep && !inQuotes) {
        out.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    out.push(current.trim());
    return out;
  }

  function aggregateForReport(rows) {
    const map = {};
    rows.forEach((row) => {
      const key = `${row.sku}`;
      if (!map[key]) {
        map[key] = {
          sku: row.sku,
          name: row.name || "—",
          category: normalizeCategory(row.category, row.sku),
          brand: row.brand || "—",
          warehouse: "Все склады",
          stock: 0,
          inTransit: 0,
          totalStock: 0,
          bought: 0,
          ordered: 0,
          sizeCount: 0,
        };
      }
      map[key].stock += row.stock || 0;
      map[key].inTransit += row.inTransit || 0;
      map[key].totalStock += row.totalStock || 0;
      map[key].bought += row.bought || 0;
      map[key].ordered += row.ordered || 0;
      map[key].sizeCount += 1;
    });
    const out = Object.values(map);
    out.forEach((row) => {
      row.buyoutPercent = row.ordered > 0 ? (row.bought / row.ordered) * 100 : 0;
    });
    return out;
  }

  function aggregateForReportByWarehouse(rows) {
    const map = {};
    rows.forEach((row) => {
      const key = `${row.sku}__${row.warehouse}`;
      if (!map[key]) {
        map[key] = {
          sku: row.sku,
          name: row.name || "—",
          category: normalizeCategory(row.category, row.sku),
          brand: row.brand || "—",
          warehouse: row.warehouse,
          stock: 0,
          inTransit: 0,
          totalStock: 0,
          bought: 0,
          ordered: 0,
          sizeCount: 0,
        };
      }
      map[key].stock += row.stock || 0;
      map[key].inTransit += row.inTransit || 0;
      map[key].totalStock += row.totalStock || 0;
      map[key].bought += row.bought || 0;
      map[key].ordered += row.ordered || 0;
      map[key].sizeCount += 1;
    });
    const out = Object.values(map);
    out.forEach((row) => {
      row.buyoutPercent = row.ordered > 0 ? (row.bought / row.ordered) * 100 : 0;
    });
    return out;
  }

  function extractCategory(source = {}, sku = "") {
    const candidates = [
      source.subject,
      source.subjectName,
      source.object,
      source.objectName,
      source.category,
      source.categoryName,
      source.parentCategory,
    ];
    for (const value of candidates) {
      const cat = String(value || "").trim();
      if (cat) return cat;
    }
    return normalizeCategory("", sku);
  }

  function extractDisplayName(source = {}, sku = "") {
    const candidates = [
      source.nmName,
      source.name,
      source.productName,
      source.goodsName,
      source.title,
      source.vendorCodeName,
      source.supplierArticleName,
      source.techSizeName,
    ];
    for (const value of candidates) {
      const name = String(value || "").trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      const subject = String(source.subject || source.subjectName || "").trim().toLowerCase();
      const category = String(source.category || source.categoryName || "").trim().toLowerCase();
      const brand = String(source.brand || source.brandName || "").trim().toLowerCase();
      const skuNorm = String(sku || "").trim().toLowerCase();
      if (subject && lower === subject) continue;
      if (category && lower === category) continue;
      if (brand && lower === brand) continue;
      if (skuNorm && lower === skuNorm) continue;
      return name;
    }
    return normalizeProductName("", sku, toNum(source.nmId, 0));
  }

  function extractBrand(source = {}) {
    const brand = String(source.brand || source.brandName || "").trim();
    return brand || "—";
  }

  function normalizeCategory(rawCategory, sku = "") {
    const c = String(rawCategory || "").trim();
    if (c) return c;
    const s = String(sku || "").trim();
    if (!s) return "Без категории";
    const token = s.split(/[-_ ]/)[0];
    return token || "Без категории";
  }

  function normalizeProductName(rawName, sku, nmId) {
    const name = String(rawName || "").trim();
    const skuNorm = String(sku || "").trim().toLowerCase();
    if (!name || name.toLowerCase() === skuNorm) {
      if (nmId && Number(nmId) > 0) return `Товар #${nmId}`;
      return "—";
    }
    return name;
  }

  function shouldResolveName(row = {}) {
    const name = String(row.name || "").trim();
    if (!name || name === "—") return true;
    if (/^товар\s*#\d+$/i.test(name)) return true;
    const skuNorm = String(row.sku || "").trim().toLowerCase();
    const categoryNorm = String(row.category || "").trim().toLowerCase();
    const brandNorm = String(row.brand || "").trim().toLowerCase();
    const nameNorm = name.toLowerCase();
    if (skuNorm && nameNorm === skuNorm) return true;
    if (categoryNorm && nameNorm === categoryNorm) return true;
    if (brandNorm && nameNorm === brandNorm) return true;
    return false;
  }

  function csvValue(value) {
    const s = String(value ?? "");
    if (s.includes(";") || s.includes('"') || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
    return s;
  }

  function downloadText(fileName, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function normalizeHeader(v) {
    return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function toNum(v, fallback) {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeSkuToken(value) {
    return String(value || "").trim().toLowerCase();
  }

  function q(selector) {
    return document.querySelector(selector);
  }

  function qa(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function structuredCloneSafe(data) {
    try {
      return structuredClone(data);
    } catch {
      return JSON.parse(JSON.stringify(data));
    }
  }

  // ========== МОБИЛЬНОЕ МЕНЮ ДЛЯ IPAD ==========
  (function() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    function init() {
      const burgerBtn = document.getElementById('burger-btn');
      const mobileMenu = document.getElementById('mobile-menu');
      const mobileOverlay = document.getElementById('mobile-menu-overlay');
      const closeMenuBtn = document.getElementById('mobile-close-menu');

      if (!burgerBtn || !mobileMenu) return;

      function openMenu() {
        mobileMenu.classList.add('open');
        if (mobileOverlay) mobileOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
      }

      function closeMenu() {
        mobileMenu.classList.remove('open');
        if (mobileOverlay) mobileOverlay.classList.remove('open');
        document.body.style.overflow = '';
      }

      burgerBtn.addEventListener('click', openMenu);
      if (mobileOverlay) mobileOverlay.addEventListener('click', closeMenu);
      if (closeMenuBtn) closeMenuBtn.addEventListener('click', closeMenu);

      const mobileDashboard = document.getElementById('mobile-dashboard-btn');
      const mobileCalc = document.getElementById('mobile-calc-btn');
      const desktopDashboard = document.getElementById('nav-dashboard-btn');
      const desktopCalc = document.getElementById('nav-calc-btn');

      if (mobileDashboard && desktopDashboard) {
        mobileDashboard.addEventListener('click', function(e) {
          e.preventDefault();
          desktopDashboard.click();
          closeMenu();
        });
      }

      if (mobileCalc && desktopCalc) {
        mobileCalc.addEventListener('click', function(e) {
          e.preventDefault();
          desktopCalc.click();
          closeMenu();
        });
      }

      const mobileAnalyticsStock = document.getElementById('mobile-analytics-stock-btn');
      const desktopAnalyticsStock = document.getElementById('nav-analytics-stock-btn');
      if (mobileAnalyticsStock && desktopAnalyticsStock) {
        mobileAnalyticsStock.addEventListener('click', function() {
          desktopAnalyticsStock.click();
          closeMenu();
        });
      }

      const mobileAnalyticsWarehouse = document.getElementById('mobile-analytics-warehouse-btn');
      const desktopAnalyticsWarehouse = document.getElementById('nav-analytics-warehouse-btn');
      if (mobileAnalyticsWarehouse && desktopAnalyticsWarehouse) {
        mobileAnalyticsWarehouse.addEventListener('click', function() {
          desktopAnalyticsWarehouse.click();
          closeMenu();
        });
      }

      const mobileAnalyticsTurnover = document.getElementById('mobile-analytics-turnover-btn');
      const desktopAnalyticsTurnover = document.getElementById('nav-analytics-turnover-btn');
      if (mobileAnalyticsTurnover && desktopAnalyticsTurnover) {
        mobileAnalyticsTurnover.addEventListener('click', function() {
          desktopAnalyticsTurnover.click();
          closeMenu();
        });
      }
    }
  })();
})();
