import '@testing-library/jest-dom'
import { vi, beforeEach, afterEach } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock Web3Modal hooks
vi.mock('@/lib/web3modal', () => ({
  useWeb3ModalAccount: vi.fn(() => ({
    address: undefined,
    isConnected: false,
    chainId: undefined,
  })),
  useWeb3ModalProvider: vi.fn(() => ({
    walletProvider: undefined,
  })),
  useWeb3Modal: vi.fn(() => ({
    open: vi.fn(),
    close: vi.fn(),
  })),
}))

// Mock ethers - use a class-like mock for BrowserProvider
vi.mock('ethers', () => {
  // Create a mock class that can be instantiated with 'new'
  class MockBrowserProvider {
    getSigner() {
      return Promise.resolve({
        signMessage: () => Promise.resolve('0xmocksignature123'),
        getAddress: () => Promise.resolve('0xTestWallet123'),
      })
    }
  }

  class MockContract {
    getCurrentPriceFLR() {
      return Promise.resolve(BigInt(1000000000000000000))
    }
  }

  return {
    BrowserProvider: MockBrowserProvider,
    Contract: MockContract,
    parseEther: vi.fn((value: string) => BigInt(parseFloat(value) * 1e18)),
    formatEther: vi.fn((value: bigint) => (Number(value) / 1e18).toString()),
  }
})

// Mock API service
vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

// Mock admin API
vi.mock('@/services/adminApi', () => ({
  verifyAdmin: vi.fn().mockResolvedValue({ isAdmin: true }),
}))

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.clear()
})

afterEach(() => {
  vi.resetAllMocks()
})
