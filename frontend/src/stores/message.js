import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useMessageStore = defineStore('message', () => {
  const unreadCount = ref(0)
  const groupUnreadCount = ref(0)
  const totalUnreadCount = computed(() => unreadCount.value + groupUnreadCount.value)

  function setUnreadCount(count) {
    unreadCount.value = count
  }

  function setGroupUnreadCount(count) {
    groupUnreadCount.value = count
  }

  function addUnreadCount(count = 1) {
    unreadCount.value += count
    if (unreadCount.value < 0) unreadCount.value = 0
  }

  function addGroupUnreadCount(count = 1) {
    groupUnreadCount.value += count
    if (groupUnreadCount.value < 0) groupUnreadCount.value = 0
  }

  function reset() {
    unreadCount.value = 0
    groupUnreadCount.value = 0
  }

  return {
    unreadCount,
    groupUnreadCount,
    totalUnreadCount,
    setUnreadCount,
    setGroupUnreadCount,
    addUnreadCount,
    addGroupUnreadCount,
    reset
  }
})
