import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authAPI } from '../api/modules'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const username = ref(localStorage.getItem('username') || '')

  const isLoggedIn = computed(() => !!token.value)

  async function login(user, pass) {
    const res = await authAPI.login(user, pass)
    const data = res.data
    token.value = data.token
    username.value = user
    localStorage.setItem('token', data.token)
    localStorage.setItem('username', user)
  }

  async function register(user, pass) {
    const res = await authAPI.register(user, pass)
    const data = res.data
    token.value = data.token
    username.value = user
    localStorage.setItem('token', data.token)
    localStorage.setItem('username', user)
  }

  function logout() {
    token.value = ''
    username.value = ''
    localStorage.removeItem('token')
    localStorage.removeItem('username')
  }

  return { token, username, isLoggedIn, login, register, logout }
})
