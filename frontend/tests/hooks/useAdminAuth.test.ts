import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { useWeb3ModalAccount, useWeb3ModalProvider } from '@/lib/web3modal'
import { verifyAdmin } from '@/services/adminApi'
import api from '@/services/api'

// Type the mocked modules
const mockedUseWeb3ModalAccount = vi.mocked(useWeb3ModalAccount)
const mockedUseWeb3ModalProvider = vi.mocked(useWeb3ModalProvider)
const mockedVerifyAdmin = vi.mocked(verifyAdmin)
const mockedApiGet = vi.fn()
const mockedApiPost = vi.fn()
vi.mocked(api).get = mockedApiGet as typeof api.get
vi.mocked(api).post = mockedApiPost as typeof api.post

const AUTH_STORAGE_KEY = 'halcyon_auth_session'

const mockAdminWallet = '0xAdminWallet123456789'
const mockNonce = 'test-nonce-123'
const mockSignature = '0xmocksignature123456789'
const mockExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()

describe('useAdminAuth', () => {
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

    // Default: admin verified
    mockedVerifyAdmin.mockResolvedValue({ isAdmin: true, wallet: '0xTestWallet' })

    // Default API responses
    mockedApiGet.mockResolvedValue({
      data: {
        nonce: mockNonce,
        message: 'Sign this message to authenticate',
        expiresAt: mockExpiresAt,
      },
    })
  })

  describe('initial state', () => {
    it('should extend useAuth with admin state', () => {
      const { result } = renderHook(() => useAdminAuth())

      // From useAuth
      expect(result.current.isConnected).toBe(false)
      expect(result.current.address).toBeUndefined()
      expect(result.current.isAuthenticated).toBe(false)

      // Admin-specific
      expect(result.current.isAdmin).toBe(false)
      expect(result.current.isVerifying).toBe(false)
      expect(result.current.verificationError).toBeNull()
      expect(result.current.lastVerified).toBeNull()
    })
  })

  describe('verifyAdminStatus', () => {
    beforeEach(() => {
      const mockWalletProvider = {} as any

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockAdminWallet as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)
      mockedUseWeb3ModalProvider.mockReturnValue({
        walletProvider: mockWalletProvider,
        walletProviderType: 'walletConnect',
      } as ReturnType<typeof useWeb3ModalProvider>)

      // Pre-authenticate
      const storedSession = {
        wallet: mockAdminWallet,
        signature: mockSignature,
        nonce: mockNonce,
        expiresAt: mockExpiresAt,
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession))
    })

    it('should verify admin status successfully', async () => {
      mockedVerifyAdmin.mockResolvedValue({ isAdmin: true, wallet: '0xTestWallet' })

      const { result } = renderHook(() => useAdminAuth())

      const isAdmin = await act(async () => {
        return result.current.verifyAdminStatus()
      })

      expect(isAdmin).toBe(true)
      expect(result.current.isAdmin).toBe(true)
      expect(result.current.verificationError).toBeNull()
      expect(result.current.lastVerified).toBeInstanceOf(Date)
    })

    it('should return false if wallet not connected', async () => {
      mockedUseWeb3ModalAccount.mockReturnValue({
        address: undefined,
        isConnected: false,
        chainId: undefined,
        status: 'disconnected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result } = renderHook(() => useAdminAuth())

      const isAdmin = await act(async () => {
        return result.current.verifyAdminStatus()
      })

      expect(isAdmin).toBe(false)
      expect(result.current.verificationError).toBe('Wallet not connected')
    })
  })

  describe('getReadAuthCredentials', () => {
    beforeEach(() => {
      const mockWalletProvider = {} as any

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockAdminWallet as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)
      mockedUseWeb3ModalProvider.mockReturnValue({
        walletProvider: mockWalletProvider,
        walletProviderType: 'walletConnect',
      } as ReturnType<typeof useWeb3ModalProvider>)
    })

    it('should return credentials with signature', async () => {
      const { result } = renderHook(() => useAdminAuth())

      const credentials = await act(async () => {
        return result.current.getReadAuthCredentials()
      })

      expect(credentials).toHaveProperty('wallet', mockAdminWallet)
      expect(credentials).toHaveProperty('signature')
      expect(credentials).toHaveProperty('timestamp')
      expect(typeof credentials.timestamp).toBe('number')
    })

    it('should throw if wallet not connected', async () => {
      mockedUseWeb3ModalAccount.mockReturnValue({
        address: undefined,
        isConnected: false,
        chainId: undefined,
        status: 'disconnected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result } = renderHook(() => useAdminAuth())

      await expect(
        act(async () => {
          await result.current.getReadAuthCredentials()
        })
      ).rejects.toThrow('Wallet not connected')
    })

    it('should throw if wallet provider not available', async () => {
      mockedUseWeb3ModalProvider.mockReturnValue({
        walletProvider: undefined,
        walletProviderType: undefined,
      } as ReturnType<typeof useWeb3ModalProvider>)

      const { result } = renderHook(() => useAdminAuth())

      await expect(
        act(async () => {
          await result.current.getReadAuthCredentials()
        })
      ).rejects.toThrow('Wallet provider not available')
    })
  })

  describe('getWalletOnly (deprecated)', () => {
    it('should throw deprecation error', () => {
      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockAdminWallet as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result } = renderHook(() => useAdminAuth())

      expect(() => {
        result.current.getWalletOnly()
      }).toThrow('getWalletOnly is deprecated')
    })
  })

  describe('getAdminCredentials', () => {
    beforeEach(() => {
      const mockWalletProvider = {} as any

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockAdminWallet as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)
      mockedUseWeb3ModalProvider.mockReturnValue({
        walletProvider: mockWalletProvider,
        walletProviderType: 'walletConnect',
      } as ReturnType<typeof useWeb3ModalProvider>)

      // Pre-authenticate
      const storedSession = {
        wallet: mockAdminWallet,
        signature: mockSignature,
        nonce: mockNonce,
        expiresAt: mockExpiresAt,
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession))
    })

    it('should return auth credentials for write operations', async () => {
      const { result } = renderHook(() => useAdminAuth())

      const credentials = await act(async () => {
        return result.current.getAdminCredentials()
      })

      expect(credentials).toHaveProperty('wallet', mockAdminWallet)
      expect(credentials).toHaveProperty('signature', mockSignature)
      expect(credentials).toHaveProperty('nonce', mockNonce)
    })
  })

  describe('adminPost', () => {
    beforeEach(() => {
      const mockWalletProvider = {} as any

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockAdminWallet as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)
      mockedUseWeb3ModalProvider.mockReturnValue({
        walletProvider: mockWalletProvider,
        walletProviderType: 'walletConnect',
      } as ReturnType<typeof useWeb3ModalProvider>)

      // Pre-authenticate
      const storedSession = {
        wallet: mockAdminWallet,
        signature: mockSignature,
        nonce: mockNonce,
        expiresAt: mockExpiresAt,
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession))

      mockedApiPost.mockResolvedValue({
        data: { success: true },
      })
    })

    it('should make authenticated POST request', async () => {
      const { result } = renderHook(() => useAdminAuth())

      const response = await act(async () => {
        return result.current.adminPost<{ success: boolean }>('/admin/test', { data: 'value' })
      })

      expect(response).toEqual({ success: true })
      expect(mockedApiPost).toHaveBeenCalledWith('/admin/test', {
        data: 'value',
        wallet: mockAdminWallet,
        signature: mockSignature,
        nonce: mockNonce,
      })
    })
  })

  describe('wallet change handling', () => {
    it('should clear admin state when wallet changes', () => {
      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockAdminWallet as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      const { result, rerender } = renderHook(() => useAdminAuth())

      // Simulate wallet change
      mockedUseWeb3ModalAccount.mockReturnValue({
        address: '0xDifferentWallet' as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)

      rerender()

      expect(result.current.isAdmin).toBe(false)
      expect(result.current.verificationError).toBeNull()
      expect(result.current.lastVerified).toBeNull()
    })
  })

  describe('isAdminWallet alias', () => {
    beforeEach(() => {
      const mockWalletProvider = {} as any

      mockedUseWeb3ModalAccount.mockReturnValue({
        address: mockAdminWallet as `0x${string}`,
        isConnected: true,
        chainId: 114,
        status: 'connected',
      } as ReturnType<typeof useWeb3ModalAccount>)
      mockedUseWeb3ModalProvider.mockReturnValue({
        walletProvider: mockWalletProvider,
        walletProviderType: 'walletConnect',
      } as ReturnType<typeof useWeb3ModalProvider>)

      const storedSession = {
        wallet: mockAdminWallet,
        signature: mockSignature,
        nonce: mockNonce,
        expiresAt: mockExpiresAt,
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession))
    })

    it('should mirror isAdmin state', async () => {
      mockedVerifyAdmin.mockResolvedValue({ isAdmin: true, wallet: '0xTestWallet' })

      const { result } = renderHook(() => useAdminAuth())

      expect(result.current.isAdminWallet).toBe(false)

      await act(async () => {
        await result.current.verifyAdminStatus()
      })

      expect(result.current.isAdminWallet).toBe(true)
      expect(result.current.isAdmin).toBe(result.current.isAdminWallet)
    })
  })
})
