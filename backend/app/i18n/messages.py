"""Server messages in the caller's language.

Call sites keep raising ``HTTPException(detail="<Uzbek text>")``; the global
exception handler looks the text up in ``MESSAGES`` and answers in the language
of the ``Accept-Language`` header. The key is the source text itself. Messages
that carry a value are built with ``translate_detail("... {name} ...", name=v)``
and the key is that template. A text that is not in ``MESSAGES`` is returned
unchanged. Uzbek is the source language; terminology follows
``docs/i18n-glossary.md``.
"""
from __future__ import annotations

from fastapi import Request

SUPPORTED_LANGUAGES = ("uz", "ru", "en")
DEFAULT_LANGUAGE = "uz"


class TranslatableDetail(str):
    """A message with values. ``str(...)`` is the Uzbek text (so callers that
    never look at the language see exactly what they always saw); the handler
    formats the translated template with the same values."""

    template: str
    values: dict

    def __new__(cls, template: str, **values):
        obj = super().__new__(cls, template.format(**values))
        obj.template = template
        obj.values = values
        return obj


def translate_detail(template: str, **values) -> TranslatableDetail:
    return TranslatableDetail(template, **values)


def request_language(request: Request) -> str:
    """First of uz/ru/en in the Accept-Language header, best q-value first."""
    header = request.headers.get("accept-language", "")
    ranked: list[tuple[float, int, str]] = []
    for index, part in enumerate(header.split(",")):
        tag, *params = (p.strip() for p in part.split(";"))
        if not tag:
            continue
        q = 1.0
        for param in params:
            if param.lower().startswith("q="):
                try:
                    q = float(param[2:])
                except ValueError:
                    q = 0.0
        if q > 0:
            ranked.append((-q, index, tag.lower().split("-")[0]))
    for _, _, lang in sorted(ranked):
        if lang in SUPPORTED_LANGUAGES:
            return lang
    return DEFAULT_LANGUAGE


def translate(text, lang: str):
    """*text* in *lang*; the text itself when there is no translation."""
    if isinstance(text, TranslatableDetail):
        template = MESSAGES.get(text.template, {}).get(lang, text.template)
        return template.format(**text.values)
    if isinstance(text, str):
        return MESSAGES.get(text, {}).get(lang, text)
    return text


def localized(request: Request, text: str) -> str:
    """Translate a message that is returned (not raised) as a response body.
    A request without Accept-Language keeps the source text, like the handler."""
    if not request.headers.get("accept-language"):
        return text
    return translate(text, request_language(request))


def _table(*rows: tuple[str, ...]) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for row in rows:
        key, ru, en, *uz = row
        out[key] = {"ru": ru, "en": en}
        if uz:
            out[key]["uz"] = uz[0]
    return out


MESSAGES: dict[str, dict[str, str]] = _table(
    # --- auth and access -------------------------------------------------
    ("Not authenticated", "Вы не авторизованы", "Not authenticated", "Kirish talab qilinadi"),
    ("Could not validate credentials", "Не удалось проверить учётные данные", "Could not validate credentials", "Kirish ma'lumotlarini tekshirib bo'lmadi"),
    ("Inactive user account", "Аккаунт отключён", "Inactive user account", "Hisob faol emas"),
    ("Faqat administrator uchun", "Только для администратора", "Administrators only"),
    ("OTP service temporarily unavailable. Try again later.", "Сервис кодов подтверждения временно недоступен. Повторите попытку позже.", "OTP service temporarily unavailable. Try again later.", "Tasdiqlash kodi xizmati vaqtincha ishlamayapti. Keyinroq qayta urinib ko'ring."),
    ("Too many OTP requests from this IP. Please wait before trying again.", "Слишком много запросов кода с этого IP-адреса. Подождите перед повторной попыткой.", "Too many OTP requests from this IP. Please wait before trying again.", "Bu IP manzildan tasdiqlash kodi juda ko'p so'raldi. Qayta urinishdan oldin biroz kuting."),
    ("Too many OTP requests. Please wait before trying again.", "Слишком много запросов кода. Подождите перед повторной попыткой.", "Too many OTP requests. Please wait before trying again.", "Tasdiqlash kodi juda ko'p so'raldi. Qayta urinishdan oldin biroz kuting."),
    ("Too many failed attempts. Wait 5 minutes and request a new OTP.", "Слишком много неудачных попыток. Подождите 5 минут и запросите новый код.", "Too many failed attempts. Wait 5 minutes and request a new OTP.", "Juda ko'p muvaffaqiyatsiz urinish. 5 daqiqa kutib, yangi kod so'rang."),
    ("Invalid or expired OTP code.", "Неверный или просроченный код.", "Invalid or expired OTP code.", "Kod noto'g'ri yoki muddati tugagan."),
    ("Refresh token missing.", "Отсутствует токен обновления.", "Refresh token missing.", "Yangilash tokeni yo'q."),
    ("Invalid or expired refresh token.", "Неверный или просроченный токен обновления.", "Invalid or expired refresh token.", "Yangilash tokeni noto'g'ri yoki muddati tugagan."),
    ("User not found.", "Пользователь не найден.", "User not found.", "Foydalanuvchi topilmadi."),
    ("Bu username allaqachon band.", "Это имя пользователя уже занято.", "This username is already taken."),
    ("Username yoki parol noto'g'ri.", "Неверное имя пользователя или пароль.", "Incorrect username or password."),
    ("Bu IP manzildan juda ko'p ro'yxatdan o'tish urinishi bo'ldi. Birozdan keyin qayta urinib ko'ring.", "Слишком много попыток регистрации с этого IP-адреса. Повторите попытку чуть позже.", "Too many sign-up attempts from this IP address. Please try again in a little while."),
    ("Bu IP manzildan juda ko'p kirish urinishi bo'ldi. Birozdan keyin qayta urinib ko'ring.", "Слишком много попыток входа с этого IP-адреса. Повторите попытку чуть позже.", "Too many sign-in attempts from this IP address. Please try again in a little while."),
    ("Bu hisob uchun juda ko'p kirish urinishi bo'ldi. Birozdan keyin qayta urinib ko'ring.", "Слишком много попыток входа в этот аккаунт. Повторите попытку чуть позже.", "Too many sign-in attempts for this account. Please try again in a little while."),
    ("Juda ko'p urinish bo'ldi. Birozdan keyin qayta urinib ko'ring.", "Слишком много попыток. Повторите попытку чуть позже.", "Too many attempts. Please try again in a little while."),
    ("Google orqali kirish hozircha mavjud emas.", "Вход через Google пока недоступен.", "Signing in with Google is not available yet."),
    ("Google orqali kirib bo'lmadi. Qayta urinib ko'ring.", "Не удалось войти через Google. Повторите попытку.", "Could not sign in with Google. Please try again."),
    ("Google bilan bog'lanib bo'lmadi. Birozdan keyin qayta urinib ko'ring.", "Не удалось связаться с Google. Повторите попытку чуть позже.", "Could not reach Google. Please try again in a little while."),
    ("Google hisobingizdagi email tasdiqlanmagan.", "Email в вашем аккаунте Google не подтверждён.", "The email on your Google account is not verified."),
    ("Apple orqali kirish hozircha mavjud emas.", "Вход через Apple пока недоступен.", "Signing in with Apple is not available yet."),
    ("Apple orqali kirib bo'lmadi. Qayta urinib ko'ring.", "Не удалось войти через Apple. Повторите попытку.", "Could not sign in with Apple. Please try again."),
    ("Apple bilan bog'lanib bo'lmadi. Birozdan keyin qayta urinib ko'ring.", "Не удалось связаться с Apple. Повторите попытку чуть позже.", "Could not reach Apple. Please try again in a little while."),
    ("Juda ko'p shikoyat yuborildi. Birozdan keyin qayta urinib ko'ring.", "Отправлено слишком много жалоб. Повторите попытку чуть позже.", "Too many reports sent. Please try again in a little while."),
    ("Shikoyat topilmadi", "Жалоба не найдена", "Report not found"),
    ("Administrator hisobini bu yerdan o'chirib bo'lmaydi", "Аккаунт администратора нельзя удалить здесь", "An administrator account cannot be deleted here"),
    ("Parol noto'g'ri", "Неверный пароль", "Incorrect password"),
    ("Noto'g'ri qiymat yuborildi.", "Отправлено недопустимое значение.", "An invalid value was submitted."),
    # --- not found -----------------------------------------------------
    ("Room not found", "Комната не найдена", "Room not found", "Xona topilmadi"),
    ("Apartment not found", "Квартира не найдена", "Apartment not found", "Kvartira topilmadi"),
    ("Xona boshqa joyda o'zgartirilgan. Saqlashdan oldin qayta yuklang.", "Комната была изменена в другом месте. Перезагрузите её перед сохранением.", "The room was changed elsewhere. Reload it before saving."),
    ("Draft not found", "Черновик не найден", "Draft not found", "Qoralama topilmadi"),
    ("Device not found", "Устройство не найдено", "Device not found", "Qurilma topilmadi"),
    ("Estimate not found", "Смета не найдена", "Estimate not found", "Smeta topilmadi"),
    ("Finish not found", "Отделка не найдена", "Finish not found", "Pardoz topilmadi"),
    ("Furniture placement not found", "Расстановка мебели не найдена", "Furniture placement not found", "Mebel joylashuvi topilmadi"),
    ("Usta not found", "Мастер не найден", "Craftsman not found", "Usta topilmadi"),
    ("Job not found", "Задача не найдена", "Job not found", "Vazifa topilmadi"),
    ("Order not found", "Заказ не найден", "Order not found", "Buyurtma topilmadi"),
    ("Render not found", "Рендер не найден", "Render not found", "Render topilmadi"),
    ("Model not found", "Модель не найдена", "Model not found", "Model topilmadi"),
    ("Wall not found", "Стена не найдена", "Wall not found", "Devor topilmadi"),
    ("Opening not found", "Проём не найден", "Opening not found", "Teshik topilmadi"),
    ("Do'kon topilmadi", "Магазин не найден", "Shop not found"),
    ("Model topilmadi", "Модель не найдена", "Model not found"),
    ("Loyiha topilmadi", "Проект не найден", "Project not found"),
    ("Usta topilmadi", "Мастер не найден", "Craftsman not found"),
    ("Material topilmadi", "Материал не найден", "Material not found"),
    ("Buyurtma topilmadi", "Заказ не найден", "Order not found"),
    ("Oboy topilmadi", "Обои не найдены", "Wallpaper not found"),
    ("Rasm topilmadi", "Изображение не найдено", "Image not found"),
    ("Havola topilmadi", "Ссылка не найдена", "Link not found"),
    ("Murojaat topilmadi", "Обращение не найдено", "Inquiry not found"),
    ("So'rov topilmadi", "Запрос не найден", "Request not found"),
    ("Mahsulot topilmadi", "Товар не найден", "Product not found"),
    ("Xona topilmadi", "Комната не найдена", "Room not found"),
    ("Pin topilmadi yoki u yopiq", "Пин не найден или закрыт", "Pin not found or it is private"),
    # --- AI and Pinterest ----------------------------------------------
    ("AI xususiyatlari hozircha yoqilmagan.", "Функции ИИ пока не включены.", "AI features are not enabled yet."),
    ("Bugungi AI limiti tugadi", "Дневной лимит ИИ исчерпан", "Today's AI limit is used up"),
    ("AI javob bermadi, qayta urinib ko'ring", "ИИ не ответил, попробуйте ещё раз", "The AI did not answer, try again"),
    ("AI hozir o'chirilgan", "ИИ сейчас отключён", "AI is switched off right now"),
    ("AI hozir javob bermadi. Birozdan keyin qayta urinib ko'ring.", "ИИ сейчас не ответил. Повторите попытку чуть позже.", "The AI did not respond. Please try again in a little while."),
    ("AI uslub qo'yish allaqachon ishlayapti, birozdan keyin qayta urinib ko'ring", "Подбор стилей ИИ уже выполняется, повторите попытку чуть позже", "AI style tagging is already running, please try again in a little while"),
    ("AI javobida reja topilmadi", "В ответе ИИ не найден план", "No plan was found in the AI response"),
    ("AI javobi o'qib bo'lmadi", "Не удалось прочитать ответ ИИ", "The AI response could not be read"),
    ("AI javobi reja emas", "Ответ ИИ не является планом", "The AI response is not a plan"),
    ("AI mos tavsiya topa olmadi. Boshqacha yozib ko'ring.", "ИИ не смог подобрать подходящую рекомендацию. Попробуйте сформулировать иначе.", "The AI could not find a suitable suggestion. Try wording it differently."),
    ("Bugun AI so'rovlar limiti tugadi. Ertaga qayta urinib ko'ring.", "Лимит запросов к ИИ на сегодня исчерпан. Повторите попытку завтра.", "Today's AI request limit has been reached. Please try again tomorrow."),
    ("Bugungi rasmdan dizayn limiti tugadi", "Лимит дизайна по фото на сегодня исчерпан", "Today's limit for designs from a photo has been reached"),
    ("Bozor narxlarini tekshirish hozircha yoqilmagan", "Проверка рыночных цен пока не включена", "Market price checking is not enabled yet"),
    ("Navbat xizmati ishlamayapti", "Служба очередей не работает", "The queue service is not working"),
    ("Bu Pinterest pin havolasi emas", "Это не ссылка на пин Pinterest", "This is not a Pinterest pin link"),
    ("Pinterest hozir javob bermadi. Birozdan keyin urinib ko'ring", "Pinterest сейчас не отвечает. Повторите попытку чуть позже", "Pinterest did not respond. Please try again in a little while"),
    # --- files and images ----------------------------------------------
    ("Faqat JPEG, PNG yoki WebP rasm yuklang", "Загрузите изображение только в формате JPEG, PNG или WebP", "Upload a JPEG, PNG or WebP image only"),
    ("Rasm hajmi 10 MB dan oshmasligi kerak", "Размер изображения не должен превышать 10 МБ", "The image must not be larger than 10 MB"),
    ("Rasm hajmi {mb} MB dan oshmasligi kerak", "Размер изображения не должен превышать {mb} МБ", "The image must not be larger than {mb} MB"),
    ("Fayl hajmi {mb} MB dan oshmasligi kerak", "Размер файла не должен превышать {mb} МБ", "The file must not be larger than {mb} MB"),
    ("Model hajmi {mb} MB dan oshmasligi kerak", "Размер модели не должен превышать {mb} МБ", "The model must not be larger than {mb} MB"),
    ("Rasm faqat jpeg/png/webp formatida bo'lishi mumkin", "Изображение может быть только в формате jpeg/png/webp", "The image can only be jpeg/png/webp"),
    ("Rasm fayli buzilgan yoki noto'g'ri formatda", "Файл изображения повреждён или имеет неверный формат", "The image file is corrupted or in the wrong format"),
    ("Faqat rasm yuklash mumkin ({formats})", "Можно загружать только изображения ({formats})", "Only images can be uploaded ({formats})"),
    ("Bo'sh fayl yuborildi", "Отправлен пустой файл", "An empty file was sent"),
    ("Empty file received", "Получен пустой файл", "Empty file received", "Bo'sh fayl yuborildi"),
    ("Fayl .glb formatida bo'lishi kerak", "Файл должен быть в формате .glb", "The file must be in .glb format"),
    ("Fayl haqiqiy .glb emas", "Файл не является настоящим .glb", "The file is not a real .glb"),
    ("Faqat GLB model yuklash mumkin", "Можно загружать только модели GLB", "Only GLB models can be uploaded"),
    ("Fayl GLB formatida emas", "Файл не в формате GLB", "The file is not in GLB format"),
    ("Rasmni saqlab bo'lmadi", "Не удалось сохранить изображение", "The image could not be saved"),
    ("Modelni saqlab bo'lmadi", "Не удалось сохранить модель", "The model could not be saved"),
    ("Ulashish havolasini yaratib bo'lmadi", "Не удалось создать ссылку для обмена", "The share link could not be created"),
    ("Unsupported file type {content_type}. Accepted: {allowed}", "Неподдерживаемый тип файла {content_type}. Допустимые: {allowed}", "Unsupported file type {content_type}. Accepted: {allowed}", "Fayl turi qo'llab-quvvatlanmaydi: {content_type}. Ruxsat etilgan: {allowed}"),
    ("File exceeds maximum allowed size of {mb} MB", "Файл превышает максимально допустимый размер {mb} МБ", "File exceeds maximum allowed size of {mb} MB", "Fayl hajmi ruxsat etilgan {mb} MB dan oshib ketdi"),
    ("Failed to upload photo to storage", "Не удалось загрузить фото в хранилище", "Failed to upload photo to storage", "Rasmni xotiraga yuklab bo'lmadi"),
    ("Failed to store the image", "Не удалось сохранить изображение", "Failed to store the image", "Rasmni saqlab bo'lmadi"),
    ("Render xizmati mavjud emas", "Сервис рендера недоступен", "The render service is not available"),
    ("3D model xizmati mavjud emas", "Сервис 3D-моделей недоступен", "The 3D model service is not available"),
    ("Unknown lighting mood", "Неизвестное освещение", "Unknown lighting mood", "Noma'lum yoritish kayfiyati"),
    ("Faqat sotuvchi va administrator uchun", "Только для продавца и администратора", "Sellers and administrators only"),
    # --- shop and seller -----------------------------------------------
    ("Avval do'kon arizasini tasdiqlang", "Сначала подтвердите заявку магазина", "Approve the shop application first"),
    ("Sizda do'kon yo'q", "У вас нет магазина", "You do not have a shop"),
    ("Sizda allaqachon do'kon bor", "У вас уже есть магазин", "You already have a shop"),
    ("Faqat rad etilgan ariza qayta yuboriladi", "Повторно можно отправить только отклонённую заявку", "Only a rejected application can be resubmitted"),
    ("Do'koningiz hali tasdiqlanmagan", "Ваш магазин ещё не подтверждён", "Your shop has not been approved yet"),
    ("Do'koningiz rad etilgan", "Ваш магазин отклонён", "Your shop has been rejected"),
    ("Tasdiqlanmagan modellar ko'p. Avval ular ko'rib chiqilishini kuting", "Слишком много неподтверждённых моделей. Дождитесь, пока их проверят", "Too many models are awaiting approval. Wait for them to be reviewed first"),
    ("Model hali tasdiqlanmagan", "Модель ещё не подтверждена", "The model has not been approved yet"),
    ("category noto'g'ri", "Неверная category", "Invalid category"),
    ("room_type noto'g'ri", "Неверный room_type", "Invalid room_type"),
    ("placement noto'g'ri", "Неверный placement", "Invalid placement"),
    ("Bugun bu do'konga juda ko'p murojaat yubordingiz, ertaga urinib ko'ring", "Сегодня вы отправили слишком много обращений в этот магазин, повторите попытку завтра", "You have sent too many inquiries to this shop today, please try again tomorrow"),
    ("price_uzs manfiy bo'lishi mumkin emas", "price_uzs не может быть отрицательным", "price_uzs cannot be negative"),
    ("price_min price_max dan katta bo'lishi mumkin emas", "price_min не может быть больше price_max", "price_min cannot be greater than price_max"),
    ("partner_tier {allowed} dan biri bo'lishi kerak", "partner_tier должен быть одним из: {allowed}", "partner_tier must be one of: {allowed}"),
    ("category {allowed} dan biri bo'lishi kerak", "category должна быть одной из: {allowed}", "category must be one of: {allowed}"),
    ("room_type {allowed} dan biri bo'lishi kerak", "room_type должен быть одним из: {allowed}", "room_type must be one of: {allowed}"),
    ("room_type {allowed} dan biri (yoki bo'sh) bo'lishi kerak", "room_type должен быть одним из: {allowed} (или пустым)", "room_type must be one of: {allowed} (or empty)"),
    ("placement {allowed} dan biri bo'lishi kerak", "placement должен быть одним из: {allowed}", "placement must be one of: {allowed}"),
    ("model_yaw {allowed} dan biri bo'lishi kerak", "model_yaw должен быть одним из: {allowed}", "model_yaw must be one of: {allowed}"),
    ("sort {allowed} dan biri (yoki bo'sh) bo'lishi kerak", "sort должен быть одним из: {allowed} (или пустым)", "sort must be one of: {allowed} (or empty)"),
    ("styles {allowed} dan bo'lishi kerak", "styles должны быть из списка: {allowed}", "styles must be from: {allowed}"),
    ("Noto'g'ri kind — ruxsat etilgan: {allowed}", "Неверный kind — допустимые значения: {allowed}", "Invalid kind — allowed: {allowed}"),
    ("{field_name} musbat son bo'lishi kerak", "{field_name} должно быть положительным числом", "{field_name} must be a positive number"),
    ("Faqat administrator oboy nomi/narxi/do'konini belgilashi mumkin", "Только администратор может задавать название, цену и магазин обоев", "Only an administrator can set a wallpaper's name, price and shop"),
    ("Faqat administrator o'chira oladi", "Удалять может только администратор", "Only an administrator can delete"),
    ("Holat noto'g'ri", "Неверный статус", "Invalid status"),
    # --- orders ---------------------------------------------------------
    ("Har bir qator katalogdagi material yoki mebelga bog'langan bo'lishi kerak.", "Каждая строка должна быть связана с материалом или мебелью из каталога.", "Every line must be linked to a catalog material or furniture item."),
    ("Bitta buyurtmada faqat bitta do'kon mahsulotlari bo'lishi mumkin.", "В одном заказе могут быть товары только одного магазина.", "One order can only contain products from a single shop."),
    ("Noto'g'ri material ID.", "Неверный ID материала.", "Invalid material ID."),
    ("Noto'g'ri mebel ID.", "Неверный ID мебели.", "Invalid furniture ID."),
    ("Narxi belgilanmagan, buyurtma berib bo'lmaydi: {items}.", "Цена не указана, заказ оформить нельзя: {items}.", "No price is set, so this cannot be ordered: {items}."),
    ("Buyurtma holatini faqat keyingi bosqichga o'tkazish mumkin.", "Статус заказа можно перевести только на следующий этап.", "An order can only be moved to the next stage."),
    ("Bu bosqichda buyurtmani bekor qilib bo'lmaydi.", "На этом этапе заказ отменить нельзя.", "The order cannot be cancelled at this stage."),
    ("Bekor qilish sababini yozing.", "Укажите причину отмены.", "Write the reason for cancelling."),
    # --- usta -----------------------------------------------------------
    ("Sizda usta profili yo'q", "У вас нет профиля мастера", "You do not have a craftsman profile"),
    ("Sizda allaqachon usta profili bor", "У вас уже есть профиль мастера", "You already have a craftsman profile"),
    ("Maksimal narx minimaldan kam bo'lmasligi kerak", "Максимальная цена не должна быть меньше минимальной", "The maximum price must not be lower than the minimum"),
    ("Portfoliyoda {max_items} tadan ortiq rasm bo'lishi mumkin emas", "В портфолио не может быть более {max_items} изображений", "A portfolio cannot have more than {max_items} images"),
    # --- materials ------------------------------------------------------
    ("Nomi 1 dan 200 belgigacha bo'lishi kerak", "Название должно содержать от 1 до 200 символов", "The name must be 1 to 200 characters long"),
    ("Narx musbat bo'lishi kerak", "Цена должна быть положительной", "The price must be positive"),
    ("Qadoq hajmi musbat bo'lishi kerak", "Объём упаковки должен быть положительным", "The pack size must be positive"),
    ("Rulon o'lchami musbat bo'lishi kerak", "Размер рулона должен быть положительным", "The roll size must be positive"),
    ("Kategoriya noto'g'ri", "Неверная категория", "Invalid category"),
    ("Birlik noto'g'ri", "Неверная единица измерения", "Invalid unit"),
    ("Qadoq birligi noto'g'ri", "Неверная единица упаковки", "Invalid pack unit"),
    ("Qadoq hajmi va birligi birga kiritiladi", "Объём и единица упаковки указываются вместе", "Pack size and pack unit must be given together"),
    ("Rulon o'lchami faqat oboy uchun", "Размер рулона указывается только для обоев", "Roll size is only for wallpaper"),
    ("Bunday smeta kaliti yo'q", "Такого ключа сметы нет", "There is no such estimate key"),
    ("chiroq dona bilan sotilishi kerak", "светильник должен продаваться поштучно", "a light fixture must be sold by the piece"),
    ("kabel metrlab (m) sotilishi kerak", "кабель должен продаваться метрами (м)", "cable must be sold by the metre (m)"),
    ("{key} uchun qadoq birligi {need} bo'lishi kerak", "Для {key} единицей упаковки должна быть {need}", "The pack unit for {key} must be {need}"),
    # --- room scans (iOS) and public room links --------------------------
    ("Juda ko'p so'rov yuborildi. Birozdan so'ng qayta urinib ko'ring.", "Отправлено слишком много запросов. Повторите попытку чуть позже.", "Too many requests were sent. Please try again in a little while."),
    ("Faqat .usdz fayl qabul qilinadi", "Принимаются только файлы .usdz", "Only .usdz files are accepted"),
    ("Bo'sh fayl", "Пустой файл", "Empty file"),
    ("USDZ fayl 50 MB dan katta", "Файл USDZ больше 50 МБ", "The USDZ file is larger than 50 MB"),
    ("room_json obyekt bo'lishi kerak", "room_json должен быть объектом", "room_json must be an object"),
    ("room_json noto'g'ri JSON", "room_json — некорректный JSON", "room_json is not valid JSON"),
    ("Xona aniqlanmadi — kamida 3 ta burchak kerak", "Комната не распознана — нужно минимум 3 угла", "The room was not detected — at least 3 corners are needed"),
    ("GLB hali tayyor emas", "GLB ещё не готов", "The GLB is not ready yet"),
    ("GLB topilmadi", "GLB не найден", "GLB not found"),
    ("Bunday skanerlangan buyum yo'q", "Такого отсканированного предмета нет", "There is no such scanned item"),
    # --- rooms, walls, finishes -----------------------------------------
    ("Opening height exceeds ceiling height", "Высота проёма превышает высоту потолка", "Opening height exceeds ceiling height", "Teshik balandligi shift balandligidan oshib ketdi"),
    ("Ko'pburchak xonalar uchun vertices maydoni talab qilinadi", "Для многоугольных комнат требуется поле vertices", "The vertices field is required for polygon rooms"),
    ("Devor elementlari devor maydonidan oshib ketmoqda", "Элементы стены выходят за её площадь", "The wall's openings exceed the wall's area"),
    ("surface bo'sh bo'lmasligi va {max_len} belgidan oshmasligi kerak", "surface не должна быть пустой и не должна превышать {max_len} символов", "surface must not be empty or longer than {max_len} characters"),
    ("Xonada geometriya yo'q — surface faqat 'wall_a', 'wall_b', 'wall_c', 'wall_d', 'floor' yoki 'ceiling' bo'lishi mumkin", "В комнате нет геометрии — surface может быть только 'wall_a', 'wall_b', 'wall_c', 'wall_d', 'floor' или 'ceiling'", "The room has no geometry — surface can only be 'wall_a', 'wall_b', 'wall_c', 'wall_d', 'floor' or 'ceiling'"),
    ("Xonada '{surface}' nomli yuza yo'q. Mavjud devorlar: {walls} (yoki 'floor' / 'ceiling')", "В комнате нет поверхности '{surface}'. Доступные стены: {walls} (или 'floor' / 'ceiling')", "The room has no surface named '{surface}'. Available walls: {walls} (or 'floor' / 'ceiling')"),
    ("wall_index manfiy bo'lishi mumkin emas", "wall_index не может быть отрицательным", "wall_index cannot be negative"),
    ("wall_index {max_index} dan oshmasligi kerak (xonada {count} ta devor bor)", "wall_index не должен превышать {max_index} (в комнате стен: {count})", "wall_index must not exceed {max_index} (the room has {count} walls)"),
)
