import { create } from "zustand";
import {
  CURRENT_USER,
  registerOwners,
  type Company,
  type Owner,
  type ProductProfile,
  type SortKey,
} from "@/data/companies";
import { NOTIFICATIONS } from "@/data/notifications";
import { ANY_STAGE, DEFAULT_FILTERS } from "@/lib/companies";

type HydratePayload = {
  companies: Company[];
  products: ProductProfile[];
  owners: Owner[];
  currentUser: Owner;
};

type CompaniesState = {
  companies: Company[];
  products: ProductProfile[];
  owners: Owner[];
  currentUser: Owner;
  product: string;
  hydrated: boolean;
  sortBy: SortKey;
  owner: string;
  stage: string;
  activityWindow: number;
  selectedIds: string[];
  detailId: string | null;
  detailOpen: boolean;
  profileName: string | null;
  profileOpen: boolean;
  newCompanyOpen: boolean;
  sidebarOpen: boolean;
  searchOpen: boolean;
  unreadNotificationIds: string[];
  activeTab: string;
  hydrate: (payload: HydratePayload) => void;
  setProduct: (product: string) => void;
  setSortBy: (sortBy: SortKey) => void;
  setOwner: (owner: string) => void;
  setStage: (stage: string) => void;
  setActivityWindow: (days: number) => void;
  resetFilters: () => void;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  openProfile: (name: string) => void;
  closeProfile: () => void;
  setNewCompanyOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  setActiveTab: (tab: string) => void;
  addCompany: (company: Company) => void;
};

export const useCompaniesStore = create<CompaniesState>((set) => ({
  companies: [],
  products: [],
  owners: [],
  currentUser: CURRENT_USER,
  hydrated: false,
  ...DEFAULT_FILTERS,
  selectedIds: [],
  detailId: null,
  detailOpen: false,
  profileName: null,
  profileOpen: false,
  newCompanyOpen: false,
  sidebarOpen: false,
  searchOpen: false,
  unreadNotificationIds: NOTIFICATIONS.filter((item) => item.unread).map(
    (item) => item.id,
  ),
  activeTab: "companies",
  hydrate: ({ companies, products, owners, currentUser }) => {
    registerOwners(owners);
    set({ companies, products, owners, currentUser, hydrated: true });
  },
  setProduct: (product) => set({ product, stage: ANY_STAGE }),
  setSortBy: (sortBy) => set({ sortBy }),
  setOwner: (owner) => set({ owner }),
  setStage: (stage) => set({ stage }),
  setActivityWindow: (activityWindow) => set({ activityWindow }),
  resetFilters: () => set((state) => ({ ...DEFAULT_FILTERS, product: state.product })),
  toggleSelected: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selected) => selected !== id)
        : [...state.selectedIds, id],
    })),
  setSelected: (selectedIds) => set({ selectedIds }),
  openDetail: (detailId) =>
    set({ detailId, detailOpen: true, profileOpen: false }),
  closeDetail: () => set({ detailOpen: false }),
  openProfile: (profileName) =>
    set({ profileName, profileOpen: true, detailOpen: false }),
  closeProfile: () => set({ profileOpen: false }),
  setNewCompanyOpen: (newCompanyOpen) => set({ newCompanyOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  markNotificationRead: (id) =>
    set((state) => ({
      unreadNotificationIds: state.unreadNotificationIds.filter(
        (unread) => unread !== id,
      ),
    })),
  markAllNotificationsRead: () => set({ unreadNotificationIds: [] }),
  setActiveTab: (activeTab) => set({ activeTab }),
  addCompany: (company) =>
    set((state) => ({
      companies: [company, ...state.companies],
      newCompanyOpen: false,
    })),
}));
