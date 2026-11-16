/* Token stays in the current page's memory. Nothing here persists credentials. */
(() => {
  'use strict';
  const normalizeToken = value => String(value || '').trim().replace(/^Bearer\s+/i,'').replace(/^(['"])(.*)\1$/,'$2').trim();
  const redact = value => String(value || '').replace(/(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g,'[токен скрыт]');
  function errorMessage(response, data, method) {
    const message = String(data.message || '');
    const prefix = `GitHub HTTP ${response.status}. `;
    if(response.status===401) return prefix+'Токен не принят: он неверный, истёк или был отозван. Создайте новый токен и вставьте его целиком.';
    if(response.status===403 || response.status===429) {
      if(response.headers.get('x-ratelimit-remaining')==='0' || /rate limit/i.test(message)) return prefix+'Лимит запросов GitHub исчерпан. Повторите попытку позже.';
      if(response.headers.get('x-github-sso')) return prefix+'Нужна дополнительная авторизация токена для организации в настройках GitHub.';
      if(/resource not accessible|permission|integration/i.test(message) || method!=='GET') return prefix+'Недостаточно прав. В токене выберите Resource owner: stoliarovd-mitrey, репозиторий black_edition и Repository permissions → Contents: Read and write. Если токен ожидает одобрения, дождитесь его.';
      return prefix+redact(message || 'Доступ запрещён. Проверьте разрешения и срок действия токена.');
    }
    if(response.status===404) return prefix+'Токен не видит репозиторий или нужный объект. Проверьте Resource owner: stoliarovd-mitrey и доступ к black_edition.';
    if([409,422].includes(response.status) && /protect|rule|policy|fast.forward|reference update/i.test(message)) return prefix+'GitHub отклонил изменение ветки main. Возможны ограничения ветки или параллельное обновление. Черновик сохранён. '+redact(message);
    return prefix+redact(message || response.statusText || 'Не удалось выполнить запрос.');
  }
  function createClient(rawToken, repository) {
    const token = normalizeToken(rawToken);
    if(!token) throw new Error('Вставьте личный GitHub-токен. Подключение GitHub в ChatGPT не заполняет это поле автоматически.');
    if(/\s/.test(token)) throw new Error('В токене есть пробелы или переносы строки. Скопируйте только значение токена.');
    const base = `https://api.github.com/repos/${repository}`;
    const api = async (path='', method='GET', body) => {
      let response;
      try {
        response = await fetch(base+(path?`/${path}`:''),{method,cache:'no-store',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      } catch {
        throw new Error('Браузер не смог связаться с api.github.com. Проверьте интернет, VPN и блокировку запросов. Это сетевая ошибка; проверить токен пока не удалось.');
      }
      const data = await response.json().catch(()=>({}));
      if(!response.ok) {
        const error = new Error(errorMessage(response,data,method));
        error.status = response.status;
        error.stage = `${method} ${path || 'repository'}`;
        throw error;
      }
      return data;
    };
    const probe = async () => {
      const repositoryInfo = await api();
      if(repositoryInfo.archived) throw new Error('Репозиторий архивирован. GitHub не разрешит сохранить в него изменения.');
      // A loose blob confirms write permission without a commit, branch update or deployment.
      await api('git/blobs','POST',{encoding:'utf-8',content:'Caviar Most Wanted editor: write permission check.\n'});
      return {repository:repositoryInfo.full_name || repository,write:true};
    };
    return {api,probe};
  }
  window.CaviarGitHub = {createClient,normalizeToken};
})();
