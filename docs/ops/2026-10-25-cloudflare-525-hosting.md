# Hosting provayderiga xabar: Cloudflare orqali HTTP 525 (2026-10-25)

> **Holat:** Cloudflare proksisi `andozaai.uz` uchun hozir o'chirilgan (DNS only), sayt to'g'ridan-to'g'ri serverga ochiladi va ishlayapti. Quyidagi xabarni VPS hosting provayderiga yuboring. Provayder tuzatgach, pastdagi "Proksini qayta yoqish" ro'yxatini bajaring.

Server `189.74.96.11`, domen `andozaai.uz`.

---

## 1. Xabar (O'zbekcha)

**Mavzu:** VPS 189.74.96.11: Cloudflare tarmog'idan kelgan ulanishlarga serverimiz javobi qaytmayapti (HTTP 525)

Assalomu alaykum!

VPS serverimiz (IP: **189.74.96.11**) bilan muammo bor. Domenimiz `andozaai.uz` uchun Cloudflare proksisini yoqsak, har bir so'rov **HTTP 525** (SSL handshake failed) qaytaradi. Proksini o'chirsak (DNS only), sayt bevosita ochiladi va ishlaydi.

Serverda tekshirganimiz:
- Cloudflare IP diapazonlaridan (masalan, `172.64.x.x`, `162.158.x.x`) kelgan ulanishlar **:443 portida SYN-RECV holatida qolib ketadi**. Server SYN-ACK yuboradi, lekin ulanish tugallanmaydi.
- Bitta ESTAB ulanishda **tasdiqlanmagan Send-Q** (yuborilgan, lekin qabul qilinmagan baytlar) bor edi. Ya'ni serverning Cloudflare tarmog'iga yuborgan javoblari manziliga yetib bormayapti.
- Boshqa tarmoqlardan (shu jumladan AWS) serverga to'g'ridan-to'g'ri ulanish **muammosiz ishlaydi**.
- Serverdagi xost firewall'i ACCEPT holatida, `iptables` da hech narsa tashlab yuborilmayapti (DROP yo'q).

Xulosa: muammo server ichida emas, yo'lda ko'rinadi: serverdan Cloudflare diapazonlari tomonga chiqadigan trafik (yoki ularning javobi) sizning tarmog'ingizda bloklanayotgan, noto'g'ri marshrutlanayotgan yoki MTU sababli tushib qolayotgan bo'lishi mumkin.

**Iltimos, tekshirib bering:**
1. Cloudflare IPv4 diapazonlari tomonga **marshrutlash** (routing) va chiqish yo'li to'g'riligini.
2. Tarmoq darajasidagi **filtrlash** (upstream firewall, DDoS himoyasi, ACL, rate-limit) Cloudflare diapazonlarini to'smayotganini.
3. **MTU / MSS** muammosini (katta paketlar, masalan TLS handshake, yo'qolayotgan bo'lishi mumkin; PMTU discovery uchun ICMP ruxsat etilganini).
4. Bu IP'ga tegishli boshqa tarmoq cheklovlari yo'qligini.

Cloudflare IPv4 diapazonlari (manba: https://www.cloudflare.com/ips-v4):

```
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22
```

Kerak bo'lsa, `ss -tn state syn-recv '( sport = :443 )'` va `tcpdump` natijalarini yuboramiz. Muammo hal bo'lgach, iltimos, bizga xabar bering.

Rahmat!

---

## 2. Сообщение (на русском)

**Тема:** VPS 189.74.96.11: ответы сервера не доходят до сети Cloudflare (HTTP 525)

Здравствуйте!

Возникла проблема с нашим VPS (IP: **189.74.96.11**). При включённом прокси Cloudflare для домена `andozaai.uz` каждый запрос возвращает **HTTP 525** (SSL handshake failed). Если прокси выключить (DNS only), сайт открывается напрямую и работает.

Что мы выяснили на сервере:
- Соединения из диапазонов Cloudflare (например, `172.64.x.x`, `162.158.x.x`) на порт **:443 зависают в состоянии SYN-RECV**. Сервер отправляет SYN-ACK, но соединение не завершается.
- В одном ESTAB-соединении наблюдался **неподтверждённый Send-Q** (отправленные, но не подтверждённые байты). То есть ответы сервера в сторону сети Cloudflare не доходят до адресата.
- Прямые подключения к серверу из других сетей (в том числе из AWS) **работают без проблем**.
- Файрвол на самом хосте в состоянии ACCEPT, в `iptables` ничего не отбрасывается (нет DROP).

Вывод: проблема не внутри сервера, а, по всей видимости, на пути трафика: исходящий к диапазонам Cloudflare трафик (или ответы от них) блокируется, неверно маршрутизируется или теряется из-за MTU.

**Просим проверить:**
1. **Маршрутизацию** до диапазонов IPv4 Cloudflare и корректность исходящего пути.
2. **Фильтрацию** на уровне сети (upstream-файрвол, защита от DDoS, ACL, rate-limit): не блокируются ли диапазоны Cloudflare.
3. **MTU / MSS** (крупные пакеты, например TLS-handshake, могут теряться; убедитесь, что ICMP для PMTU discovery разрешён).
4. Отсутствие иных сетевых ограничений для этого IP.

Диапазоны IPv4 Cloudflare (источник: https://www.cloudflare.com/ips-v4):

```
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22
```

При необходимости пришлём вывод `ss -tn state syn-recv '( sport = :443 )'` и `tcpdump`. Пожалуйста, сообщите нам, когда проблема будет устранена.

Спасибо!

---

## 3. Proksini qayta yoqish (provayder tuzatgandan keyin)

Avval **proksi o'chiq holatda** tekshiring, so'ng yoqing.

1. **Server tomonidan sinab ko'ring** (ixtiyoriy): Cloudflare diapazonidan ulanish tugayaptimi?
   ```bash
   ss -tn state syn-recv '( sport = :443 )' | head      # SYN-RECV'da qotib qolgan Cloudflare IP'lari qolmasligi kerak
   ```
2. **Cloudflare → DNS:** `A` yozuvi `@` (`andozaai.uz`) va `www` ni **Proxied** (to'q sariq bulut) holatiga qaytaring. `API` uchun alohida yozuv bo'lsa, uni ham.
3. **Cloudflare → SSL/TLS → Overview:** rejim **Full (strict)**. Server endi haqiqiy Let's Encrypt sertifikatiga ega (certbot), shuning uchun strict ishlaydi. "Flexible" ishlatmang (cheksiz redirect beradi).
4. **Tekshiring** (bir necha daqiqa kuting):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://andozaai.uz/                  # 200
   curl -s -o /dev/null -w "%{http_code}\n" https://andozaai.uz/api/v1/furniture  # 200
   curl -sI https://andozaai.uz/ | grep -i '^server:'                             # server: cloudflare
   curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://andoza.jumaniyozov.uz/login   # 301 https://andozaai.uz/login
   ```
5. **Agar yana 525 bo'lsa:** darhol A/www'ni **DNS only** ga qaytaring (sayt ishlashda qoladi) va provayderga xabar bering.
6. **Mobil ilova:** WebView va API so'rovlari (`?app=1`, GLB va rasm yuklash) proksi orqali ham ishlashini tekshiring (Cloudflare yuklash hajmi limitiga e'tibor bering: katta GLB yuklash 413 bermasligi kerak).
7. Hammasi ishlagach, [docs/WEB_PROD_DEPLOY.md](../WEB_PROD_DEPLOY.md) da "Cloudflare records are DNS only" eslatmasini yangilang.
