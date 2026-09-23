import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuth } from '@/hooks/useAuth'
import { useWeb3ModalAccount, useWeb3ModalProvider } from '@/lib/web3modal'
import api from '@/services/api'

// Type the mocked modules
const mockedUseWeb3ModalAccount = vi.mocked(useWeb3ModalAccount)
const mockedUseWeb3ModalProvider = vi.mocked(useWeb3ModalProvider)
const mockedApiGet = vi.fn()
const mockedApiPost = vi.fn()
vi.mocked(api).get = mockedApiGet as typeof api.get
vi.mocked(api).post = mockedApiPost as typeof api.post

const AUTH_STORAGE_KEY = 'halcyon_auth_session'

const mockWalletAddress = '0xTestWallet123456789'
const mockNonce = 'test-nonce-123'
const mockSignature = '0xmocksignature123456789'
const mockExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() // 4 hours from now

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()

    // Default: disconnected wallet
    mockedUseWeb3ModalAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      chainId: undefined,
      status: 'disconnected',
    } as ReturnType<typeof useWeb3ModalAccount>)
    mockedUseWeb3ModalProvider.mockReturnValue({
      walletProvider: undefined,
      walletProviderType: undefined,
    } as ReturnType<typeof useWeb3ModalProvider>)
  })

  describe('initial state', () => {
    it('should return disconnected state when wallet not connected', () => {
      const { result } = renderHook(() => useAuth())

      expect(result.current.isConnected).toBe(false)
      expect(result.current.address).toBeUndefined()
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.authError).toBeNull()
    })

    it('should return connected state when wallet is connected', () => {
      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockWalletAddress as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result } = renderHook(() => useAuth())

      expect(result.current.isConnected).toBe(true)
      expect(result.current.address).toBe(mockWalletAddress)
      expect(result.current.isAuthenticated).toBe(false) // Not authenticated yet
    })
  })

  describe('localStorage session restoration', () => {
    it('should restore valid session from localStorage', () => {
      const storedSession = {
        wallet: mockWalletAddress,
        signature: mockSignature,
        nonce: mockNonce,
        expiresAt: mockExpiresAt,
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession))

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockWalletAddress as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result } = renderHook(() => useAuth())

      expect(result.current.isAuthenticated).toBe(true)
    })

    it('should not restore expired session', () => {
      const expiredSession = {
        wallet: mockWalletAddress,
        signature: mockSignature,
        nonce: mockNonce,
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(expiredSession))

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockWalletAddress as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result } = renderHook(() => useAuth())

      expect(result.current.isAuthenticated).toBe(false)
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    })

    it('should not restore session for different wallet', () => {
      const storedSession = {
        wallet: '0xDifferentWallet',
        signature: mockSignature,
        nonce: mockNonce,
        expiresAt: mockExpiresAt,
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession))

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockWalletAddress as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result } = renderHook(() => useAuth())

      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should handle invalid JSON in localStorage', () => {
      localStorage.setItem(AUTH_STORAGE_KEY, 'invalid-json')

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockWalletAddress as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result } = renderHook(() => useAuth())

      expect(result.current.isAuthenticated).toBe(false)
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    })
  })

  describe('authenticate', () => {
    beforeEach(() => {
      const mockWalletProvider = {} as any

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockWalletAddress as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)
      mockedUseWeb3ModalProvider.mockReturnValue({
        walletProvider: mockWalletProvider,
        walletProviderType: 'walletConnect',
      } as ReturnType<typeof useWeb3ModalProvider>)

      // Mock API nonce response
      mockedApiGet.mockResolvedValue({
        data: {
          nonce: mockNonce,
          message: 'Sign this message to authenticate',
          expiresAt: mockExpiresAt,
        },
      })
    })

    it('should authenticate successfully', async () => {
      const { result } = renderHook(() => useAuth())

      await act(async () => {
        await result.current.authenticate()
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.authError).toBeNull()

      // Should persist to localStorage
      const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}')
      expect(stored.wallet).toBe(mockWalletAddress)
      expect(stored.nonce).toBe(mockNonce)
    })

    it('should throw if wallet not connected', async () => {
      mockedUseWeb3ModalAccount.mockReturnValue({
        address: undefined,
        isConnected: false,
        chainId: undefined,
        status: 'disconnected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result } = renderHook(() => useAuth())

      await expect(
        act(async () => {
          await result.current.authenticate()
        })
      ).rejects.toThrow('Wallet not connected')
    })
  })

  describe('getAuthCredentials', () => {
    beforeEach(() => {
      const mockWalletProvider = {} as any

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockWalletAddress as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)
      mockedUseWeb3ModalProvider.mockReturnValue({
        walletProvider: mockWalletProvider,
        walletProviderType: 'walletConnect',
      } as ReturnType<typeof useWeb3ModalProvider>)

      mockedApiGet.mockResolvedValue({
        data: {
          nonce: mockNonce,
          message: 'Sign this message to authenticate',
          expiresAt: mockExpiresAt,
        },
      })
    })

    it('should return cached credentials if valid', async () => {
      const storedSession = {
        wallet: mockWalletAddress,
        signature: mockSignature,
        nonce: mockNonce,
        expiresAt: mockExpiresAt,
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession))

      const { result } = renderHook(() => useAuth())

      const credentials = await act(async () => {
        return result.current.getAuthCredentials()
      })

      expect(credentials.wallet).toBe(mockWalletAddress)
      expect(credentials.signature).toBe(mockSignature)
      expect(credentials.nonce).toBe(mockNonce)

      // Should NOT have called API (used cache)
      expect(mockedApiGet).not.toHaveBeenCalled()
    })

    it('should authenticate if no valid credentials exist', async () => {
      const { result } = renderHook(() => useAuth())

      await act(async () => {
        await result.current.getAuthCredentials()
      })

      // Should have called API for nonce
      expect(mockedApiGet).toHaveBeenCalledWith('/auth/nonce', {
        params: { wallet: mockWalletAddress },
      })
    })
  })

  describe('authenticatedPost', () => {
    beforeEach(() => {
      const storedSession = {
        wallet: mockWalletAddress,
        signature: mockSignature,
        nonce: mockNonce,
        expiresAt: mockExpiresAt,
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession))

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockWalletAddress as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      mockedApiPost.mockResolvedValue({
        data: { success: true },
      })
    })

    it('should include auth credentials in POST request', async () => {
      const { result } = renderHook(() => useAuth())

      await act(async () => {
        await result.current.authenticatedPost('/api/test', { foo: 'bar' })
      })

      expect(mockedApiPost).toHaveBeenCalledWith('/api/test', {
        foo: 'bar',
        wallet: mockWalletAddress,
        signature: mockSignature,
        nonce: mockNonce,
      })
    })
  })

  describe('clearAuth', () => {
    it('should clear authentication state and localStorage', async () => {
      const storedSession = {
        wallet: mockWalletAddress,
        signature: mockSignature,
        nonce: mockNonce,
        expiresAt: mockExpiresAt,
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession))

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockWalletAddress as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result } = renderHook(() => useAuth())

      expect(result.current.isAuthenticated).toBe(true)

      act(() => {
        result.current.clearAuth()
      })

      expect(result.current.isAuthenticated).toBe(false)
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    })
  })

  describe('wallet change handling', () => {
    it('should clear auth when wallet changes', () => {
      const storedSession = {
        wallet: mockWalletAddress,
        signature: mockSignature,
        nonce: mockNonce,
        expiresAt: mockExpiresAt,
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession))

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockWalletAddress as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result, rerender } = renderHook(() => useAuth())

      expect(result.current.isAuthenticated).toBe(true)

      // Simulate wallet change
      mockedUseWeb3ModalAccount.mockReturnValue({
        address: '0xNewWallet456' as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      rerender()

      expect(result.current.isAuthenticated).toBe(false)
    })
  })
})
