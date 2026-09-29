import React from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
} from 'react-native'
import { useAppStore } from '../store/appStore'

function SettingSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <View className="mb-6">
      <Text className="text-sm font-bold text-blue-600 px-4 mb-3 uppercase">
        {title}
      </Text>
      <View className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {children}
      </View>
    </View>
  )
}

function SettingItem({
  icon,
  label,
  value,
  onPress,
  showArrow = true,
}: {
  icon: string
  label: string
  value?: string
  onPress?: () => void
  showArrow?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="px-4 py-4 flex-row justify-between items-center border-b border-gray-100 last:border-b-0"
    >
      <View className="flex-row items-center flex-1">
        <Text className="text-2xl mr-4">{icon}</Text>
        <View className="flex-1">
          <Text className="text-gray-900 font-semibold">{label}</Text>
          {value && (
            <Text className="text-sm text-gray-500 mt-1">{value}</Text>
          )}
        </View>
      </View>
      {showArrow && <Text className="text-gray-400">›</Text>}
    </TouchableOpacity>
  )
}

function SwitchItem({
  icon,
  label,
  value,
  onValueChange,
}: {
  icon: string
  label: string
  value: boolean
  onValueChange: (value: boolean) => void
}) {
  return (
    <View className="px-4 py-4 flex-row justify-between items-center border-b border-gray-100 last:border-b-0">
      <View className="flex-row items-center flex-1">
        <Text className="text-2xl mr-4">{icon}</Text>
        <Text className="text-gray-900 font-semibold">{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
        thumbColor={value ? '#0066cc' : '#f3f4f6'}
      />
    </View>
  )
}

export default function SettingsScreen({ navigation }: any) {
  const language = useAppStore((state) => state.language)
  const setLanguage = useAppStore((state) => state.setLanguage)
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const notificationsEnabled = useAppStore((state) => state.notificationsEnabled)
  const setNotificationsEnabled = useAppStore((state) => state.setNotificationsEnabled)
  const user = useAppStore((state) => state.user)
  const setUser = useAppStore((state) => state.setUser)
  const reset = useAppStore((state) => state.reset)

  const handleLogout = () => {
    Alert.alert('Chiqish', 'Hisobdan chiqmoqchisiz?', [
      { text: 'Bekor qilish', onPress: () => {} },
      {
        text: 'Chiqish',
        onPress: () => {
          setUser(null)
          reset()
          navigation.replace('AuthStack')
        },
      },
    ])
  }

  const handleResetData = () => {
    Alert.alert(
      "Barcha ma'lumotlarni o'chirish",
      "Bu amalni qaytarish mumkin emas. Barchasi o'chiriladimi?",
      [
        { text: 'Bekor qilish', onPress: () => {} },
        {
          text: "Ha, o'chirish",
          onPress: () => {
            reset()
            Alert.alert('Muvaffaqiyat', "Barcha ma'lumotlar o'chirildi")
          },
        },
      ]
    )
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="px-4 py-6 bg-blue-600">
        <Text className="text-2xl font-bold text-white">Sozlamalar</Text>
        <Text className="text-blue-100 text-sm mt-1">
          Ilovani o'z xohishingiz bo'yicha sozlang
        </Text>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-4 py-6">
        {/* Account Section */}
        <SettingSection title="Akkaunt">
          <SettingItem
            icon="👤"
            label="Foydalanuvchi profili"
            value={user?.name || user?.username || 'Nomalum'}
            onPress={() => navigation.navigate('ProfilTab')}
          />
          <SettingItem
            icon="📞"
            label="Telefon raqami"
            value={user?.phone || 'Belgilanmagan'}
            onPress={() => {}}
            showArrow={false}
          />
        </SettingSection>

        {/* Display Section */}
        <SettingSection title="Ko'rinish">
          <View className="px-4 py-4 border-b border-gray-100">
            <View className="flex-row items-center mb-3">
              <Text className="text-2xl mr-4">🎨</Text>
              <View className="flex-1">
                <Text className="text-gray-900 font-semibold">Ranglarni rejimi</Text>
                <Text className="text-sm text-gray-500 mt-1">
                  {theme === 'light' ? "☀️ Oyg'a" : '🌙 Tungi'}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-3 ml-10">
              <TouchableOpacity
                onPress={() => setTheme('light')}
                className={`flex-1 py-2 rounded-lg border-2 ${
                  theme === 'light'
                    ? 'bg-blue-100 border-blue-600'
                    : 'bg-gray-100 border-gray-300'
                }`}
              >
                <Text className="text-center font-semibold text-sm">☀️ Oyg'a</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTheme('dark')}
                className={`flex-1 py-2 rounded-lg border-2 ${
                  theme === 'dark'
                    ? 'bg-blue-100 border-blue-600'
                    : 'bg-gray-100 border-gray-300'
                }`}
              >
                <Text className="text-center font-semibold text-sm">🌙 Tungi</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="px-4 py-4">
            <View className="flex-row items-center mb-3">
              <Text className="text-2xl mr-4">🌐</Text>
              <View className="flex-1">
                <Text className="text-gray-900 font-semibold">Til</Text>
                <Text className="text-sm text-gray-500 mt-1">
                  {language === 'uz' ? "O'zbek" : language === 'ru' ? 'Russkiy' : 'English'}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-2 ml-10 flex-wrap">
              {[
                { code: 'uz', label: 'Uz' },
                { code: 'ru', label: 'Ru' },
                { code: 'en', label: 'En' },
              ].map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  onPress={() => setLanguage(lang.code as 'uz' | 'ru' | 'en')}
                  className={`px-4 py-2 rounded-lg border-2 ${
                    language === lang.code
                      ? 'bg-blue-100 border-blue-600'
                      : 'bg-gray-100 border-gray-300'
                  }`}
                >
                  <Text className="font-semibold text-sm">{lang.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </SettingSection>

        {/* Notifications Section */}
        <SettingSection title="Bildirishnomalar">
          <SwitchItem
            icon="🔔"
            label="Bildirishnomalarni qabul qilish"
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />
          <SettingItem
            icon="📢"
            label="Bildirish sozlamalari"
            value="Batafsil sozlamalar"
            onPress={() => {}}
          />
        </SettingSection>

        {/* About Section */}
        <SettingSection title="Haqida">
          <SettingItem
            icon="ℹ️"
            label="Ilova versiyasi"
            value="1.0.0"
            onPress={() => {}}
            showArrow={false}
          />
          <SettingItem
            icon="📄"
            label="Foydalanish shartlari"
            onPress={() => Linking.openURL('https://example.com/terms')}
          />
          <SettingItem
            icon="🔒"
            label="Maxfiyliq siyosati"
            onPress={() => Linking.openURL('https://example.com/privacy')}
          />
          <SettingItem
            icon="💬"
            label="Fikr-mulohaza yuborish"
            onPress={() => {
              Alert.alert('Fikr-mulohaza', 'Sizning fikringiz bizga juda muhim!')
            }}
          />
          <SettingItem
            icon="⭐"
            label="Ilovani baholash"
            onPress={() => {
              Alert.alert(
                'App Store',
                'Ilovani baholashni unutmang!',
                [{ text: 'Orqaga qaytish' }]
              )
            }}
          />
        </SettingSection>

        {/* Data Section */}
        <SettingSection title="Ma'lumotlar">
          <SettingItem
            icon="💾"
            label="Keshni o'chirish"
            value="Tez yuklashni tat"
            onPress={() => {
              Alert.alert('Muvaffaqiyat', "Kesh o'chirildi")
            }}
          />
          <SettingItem
            icon="📥"
            label="Ma'lumotlarni eksport qilish"
            value="Backup sifatida yuklab olish"
            onPress={() => {
              Alert.alert(
                'Eksport',
                "Barcha loyihalar va o'lchamlar ZIP faylida yuklab olinadi"
              )
            }}
          />
          <SettingItem
            icon="🗑️"
            label="Barcha ma'lumotlarni o'chirish"
            onPress={handleResetData}
          />
        </SettingSection>

        {/* Danger Zone */}
        <SettingSection title="Xavf zonasi">
          <TouchableOpacity
            onPress={handleLogout}
            className="px-4 py-4 flex-row items-center"
          >
            <Text className="text-2xl mr-4">🚪</Text>
            <View className="flex-1">
              <Text className="text-red-600 font-semibold">Hisobdan chiqish</Text>
              <Text className="text-sm text-gray-500 mt-1">
                Vaqtinchalik ilovadan chiqib ketish
              </Text>
            </View>
            <Text className="text-gray-400">›</Text>
          </TouchableOpacity>
        </SettingSection>

        {/* Footer */}
        <View className="items-center py-8 px-4">
          <Text className="text-center text-xs text-gray-500">
            UyTa'mir v1.0.0 • © 2024 Barcha huquqlar saqlanmoqda
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}
