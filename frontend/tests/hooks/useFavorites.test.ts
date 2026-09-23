import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useFavorites } from '@/app/register/hooks/useFavorites'

const STORAGE_KEY = 'halcyon_theme_favorites'

describe('useFavorites', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with empty favorites when localStorage is empty', () => {
      const { result } = renderHook(() => useFavorites(undefined))

      expect(result.current.favorites).toEqual([])
      expect(result.current.favoritesCount).toBe(0)
      expect(result.current.isLoading).toBe(false)
    })

    it('should load favorites from localStorage on mount', () => {
      const storedFavorites = ['theme-1', 'theme-2', 'theme-3']
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFavorites))

      const { result } = renderHook(() => useFavorites(undefined))

      // Wait for useEffect to run
      expect(result.current.favorites).toEqual(storedFavorites)
      expect(result.current.favoritesCount).toBe(3)
    })

    it('should handle invalid JSON in localStorage gracefully', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid-json')
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useFavorites(undefined))

      expect(result.current.favorites).toEqual([])
      consoleSpy.mockRestore()
    })

    it('should handle non-array data in localStorage gracefully', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }))

      const { result } = renderHook(() => useFavorites(undefined))

      expect(result.current.favorites).toEqual([])
    })
  })

  describe('toggleFavorite', () => {
    it('should add a theme to favorites when not already favorited', async () => {
      const { result } = renderHook(() => useFavorites(undefined))

      await act(async () => {
        await result.current.toggleFavorite('theme-1')
      })

      expect(result.current.favorites).toContain('theme-1')
      expect(result.current.favoritesCount).toBe(1)

      // Verify localStorage was updated
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(stored).toContain('theme-1')
    })

    it('should remove a theme from favorites when already favorited', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['theme-1', 'theme-2']))
      const { result } = renderHook(() => useFavorites(undefined))

      await act(async () => {
        await result.current.toggleFavorite('theme-1')
      })

      expect(result.current.favorites).not.toContain('theme-1')
      expect(result.current.favorites).toContain('theme-2')
      expect(result.current.favoritesCount).toBe(1)
    })

    it('should persist multiple toggles correctly', async () => {
      const { result } = renderHook(() => useFavorites(undefined))

      await act(async () => {
        await result.current.toggleFavorite('theme-1')
      })
      await act(async () => {
        await result.current.toggleFavorite('theme-2')
      })
      await act(async () => {
        await result.current.toggleFavorite('theme-3')
      })

      expect(result.current.favorites).toEqual(['theme-1', 'theme-2', 'theme-3'])

      await act(async () => {
        await result.current.toggleFavorite('theme-2')
      })

      expect(result.current.favorites).toEqual(['theme-1', 'theme-3'])
    })
  })

  describe('isFavorite', () => {
    it('should return true for favorited themes', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['theme-1', 'theme-2']))
      const { result } = renderHook(() => useFavorites(undefined))

      expect(result.current.isFavorite('theme-1')).toBe(true)
      expect(result.current.isFavorite('theme-2')).toBe(true)
    })

    it('should return false for non-favorited themes', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['theme-1']))
      const { result } = renderHook(() => useFavorites(undefined))

      expect(result.current.isFavorite('theme-999')).toBe(false)
    })
  })

  describe('addFavorite', () => {
    it('should add a theme if not already in favorites', async () => {
      const { result } = renderHook(() => useFavorites(undefined))

      await act(async () => {
        result.current.addFavorite('theme-new')
      })

      expect(result.current.favorites).toContain('theme-new')
    })

    it('should not duplicate if theme already in favorites', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['theme-1']))
      const { result } = renderHook(() => useFavorites(undefined))

      await act(async () => {
        result.current.addFavorite('theme-1')
      })

      expect(result.current.favorites.filter(f => f === 'theme-1').length).toBe(1)
    })
  })

  describe('removeFavorite', () => {
    it('should remove a theme if in favorites', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['theme-1', 'theme-2']))
      const { result } = renderHook(() => useFavorites(undefined))

      await act(async () => {
        result.current.removeFavorite('theme-1')
      })

      expect(result.current.favorites).not.toContain('theme-1')
      expect(result.current.favorites).toContain('theme-2')
    })

    it('should do nothing if theme not in favorites', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['theme-1']))
      const { result } = renderHook(() => useFavorites(undefined))

      await act(async () => {
        result.current.removeFavorite('theme-nonexistent')
      })

      expect(result.current.favorites).toEqual(['theme-1'])
    })
  })

  describe('clearFavorites', () => {
    it('should clear all favorites', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['theme-1', 'theme-2', 'theme-3']))
      const { result } = renderHook(() => useFavorites(undefined))

      await act(async () => {
        result.current.clearFavorites()
      })

      expect(result.current.favorites).toEqual([])
      expect(result.current.favoritesCount).toBe(0)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })

  describe('with wallet address', () => {
    it('should work the same with a wallet address provided', async () => {
      const walletAddress = '0x1234567890abcdef'
      const { result } = renderHook(() => useFavorites(walletAddress))

      await act(async () => {
        await result.current.toggleFavorite('theme-1')
      })

      expect(result.current.favorites).toContain('theme-1')
    })

    // Future: Test API sync when wallet connects (TODO in implementation)
  })

  describe('localStorage error handling', () => {
    it('should handle localStorage.setItem errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded')
      })

      const { result } = renderHook(() => useFavorites(undefined))

      // Should not throw, even if localStorage fails
      await act(async () => {
        await result.current.toggleFavorite('theme-1')
      })

      // State should still update locally
      expect(result.current.favorites).toContain('theme-1')

      setItemSpy.mockRestore()
      consoleSpy.mockRestore()
    })
  })
})
