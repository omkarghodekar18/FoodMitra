'use client';

import { useEffect, useState } from 'react';
import {
 LayoutDashboard, Store, Users, ShoppingCart, CreditCard, Bell, Tag,
 CheckCircle, XCircle, Pause, Play, Shield, Ban, RotateCcw, Eye, Truck, Cake, Heart, Image, BarChart3, Plus, UtensilsCrossed, MapPin, Pencil, Trash2, ArrowLeft, RefreshCw, X,
} from 'lucide-react';
import { DashboardShell, PageHeader, StatCard, EmptyState, type NavItem } from '@/components/shared/dashboard-shell';
import { LocationPickerModal } from '@/components/shared/location-picker-modal';
import { LogoUploader } from '@/components/shared/logo-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
 Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
 Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-errors';
import { useAuth } from '@/hooks/use-auth';

type SectionId = 'dashboard' | 'restaurants' | 'customers' | 'orders' | 'payments' | 'deliveryFees' | 'birthdays' | 'promos' | 'reports';

interface DashboardStats {
 customers: { total: number };
 restaurants: { total: number; active: number; pending: number };
 orders: { today: number; pending: number; delivered: number; active: number; deliveredToday: number };
 revenue: { today: number; todayCount: number };
 reviews: { total: number };
}

interface RestaurantListItem {
 id: string;
 name: string;
 cuisine: string;
 status: string;
 availability: string;
 avgRating: number;
 ratingCount: number;
 phone: string;
 email?: string | null;
 address?: { line1: string; city: string } | null;
 createdAt: string;
}

interface CustomerListItem {
 id: string;
 phone: string;
 email?: string | null;
 isActive: boolean;
 createdAt: string;
 customerProfile: { fullName: string; phone: string | null } | null;
}

interface OrderListItem {
 id: string;
 shortCode: string;
 orderStatus: string;
 paymentStatus: string;
 totalAmount: number;
 createdAt: string;
 restaurant: { name: string };
 customer: { phone: string; email: string | null; customerProfile: { fullName: string } | null };
 items: { id: string }[];
}

/** Full order shape returned by GET /api/v1/admin/orders/:id — used by the View dialog. */
interface FullOrderDetails {
 id: string;
 shortCode: string;
 orderStatus: string;
 paymentStatus: string;
 subtotal: number;
 deliveryFee: number;
 tax: number;
 discount: number;
 totalAmount: number;
 deliveryAddressLine1: string;
 deliveryAddressLine2: string | null;
 deliveryCity: string;
 deliveryPhone: string;
 createdAt: string;
 restaurant: { id: string; name: string; phone: string; email: string | null; cuisine: string };
 customer: { id: string; phone: string; email: string | null; customerProfile: { fullName: string } | null };
 items: Array<{ id: string; itemNameSnapshot: string; itemPriceSnapshot: number; isVeg: boolean; quantity: number; subtotal: number }>;
 payment: { id: string; status: string; method: string; amount: number } | null;
 statusHistory: Array<{ id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>;
}

interface PaymentListItem {
 id: string;
 amount: number;
 status: string;
 method: string;
 refundStatus: string | null;
 order: { shortCode: string; restaurant: { name: string } };
}

const NAV_ITEMS: NavItem[] = [
 { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
 { id: 'restaurants', label: 'Restaurants', icon: Store },
 { id: 'customers', label: 'Customers', icon: Users },
 { id: 'orders', label: 'Orders', icon: ShoppingCart },
 // Payments tab hidden from the UI (source code kept intact — AdminPayments component + route still exist).
 // { id: 'payments', label: 'Payments', icon: CreditCard },
 { id: 'deliveryFees', label: 'Delivery Fees', icon: Truck },
 { id: 'birthdays', label: 'Birthdays', icon: Cake },
 { id: 'promos', label: 'Promos', icon: Image },
 { id: 'reports', label: 'Reports', icon: BarChart3 },
];

export function AdminApp() {
 const [section, setSection] = useState<SectionId>('dashboard');
 // Lifted to AdminApp so the menu view can render as a full page (replacing the section content)
 // instead of as a dialog overlay. Set by AdminRestaurants' Menu button; cleared by the back button.
 const [menuTarget, setMenuTarget] = useState<RestaurantListItem | null>(null);

 return (
 <DashboardShell
 title="FoodMitra"
 navItems={NAV_ITEMS}
 activeId={menuTarget ? 'restaurants' : section}
 onSelect={(id) => { setMenuTarget(null); setSection(id as SectionId); }}
 headerColor="bg-slate-800"
 roleLabel="Admin Console"
 pageTitleOverride={menuTarget ? 'Menu management' : undefined}
 >
 {menuTarget ? (
 <AdminMenuManagement restaurant={menuTarget} onClose={() => setMenuTarget(null)} />
 ) : (
 <>
 {section === 'dashboard' && <AdminDashboard />}
 {section === 'restaurants' && <AdminRestaurants onOpenMenu={(r) => setMenuTarget(r)} />}
 {section === 'customers' && <AdminCustomers />}
 {section === 'orders' && <AdminOrders />}
 {section === 'payments' && <AdminPayments />}
 {section === 'deliveryFees' && <AdminDeliveryFees />}
 {section === 'birthdays' && <AdminBirthdays />}
 {section === 'promos' && <AdminPromos />}
 {section === 'reports' && <AdminReports />}
 </>
 )}
 </DashboardShell>
 );
}

function AdminDashboard() {
 const [stats, setStats] = useState<DashboardStats | null>(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 api.get<DashboardStats>('/api/v1/admin/dashboard')
 .then(setStats)
 .catch((e) => toastApiError(e, 'Failed to load stats'))
 .finally(() => setLoading(false));
 }, []);

 if (loading) return <div className="text-sm text-slate-500">Loading dashboard…</div>;
 if (!stats) return <EmptyState title="No data available" />;

 return (
 <div className="space-y-6">
 <PageHeader title="Platform Overview" subtitle="Today's snapshot of business activity" />
 <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
 {/* Line 1 — business overview */}
 <StatCard label="Customers" value={stats.customers.total} sub="total" icon={Users} accent="blue" />
 <StatCard label="Active Restaurants" value={`${stats.restaurants.active} / ${stats.restaurants.total}`} sub="active / total" icon={Store} accent="blue" />
 <StatCard label="Revenue Today" value={`₹${stats.revenue.today.toLocaleString('en-IN')}`} sub={`${stats.revenue.todayCount} payments`} icon={CreditCard} accent="green" />
 {/* Line 2 — order metrics */}
 <StatCard label="Orders Today" value={stats.orders.today} sub="total" icon={ShoppingCart} accent="orange" />
 <StatCard label="Active Orders" value={stats.orders.active} sub="placed / preparing / out for delivery" icon={Truck} accent="orange" />
 <StatCard label="Delivered Today" value={stats.orders.deliveredToday} sub="successful deliveries" icon={CheckCircle} accent="green" />
 </div>

 <Card>
 <CardHeader>
 <CardTitle className="text-sm">Welcome back, Admin</CardTitle>
 </CardHeader>
 <CardContent className="text-sm text-slate-600">
 <p>
 You have full platform-wide control. Approve new restaurant registrations, monitor orders and payments,
 moderate customer reviews, and configure platform-level categories from this console.
 </p>
 <p className="mt-2 text-xs text-slate-500">
 Use the left sidebar to navigate between sections. The backend enforces RBAC on every action — the UI
 only surfaces what the API actually permits.
 </p>
 </CardContent>
 </Card>
 </div>
 );
}

function AdminRestaurants({ onOpenMenu }: { onOpenMenu: (r: RestaurantListItem) => void }) {
 const [items, setItems] = useState<RestaurantListItem[]>([]);
 const [loading, setLoading] = useState(true);
 const [q, setQ] = useState('');
 const [statusFilter, setStatusFilter] = useState('');
 const [rejectTarget, setRejectTarget] = useState<RestaurantListItem | null>(null);
 const [rejectReason, setRejectReason] = useState('');
 const [showAdd, setShowAdd] = useState(false);

 // Add restaurant form state
 const [newName, setNewName] = useState('');
 const [newCuisine, setNewCuisine] = useState('');
 const [newPhone, setNewPhone] = useState('');
 const [newEmail, setNewEmail] = useState('');
 const [newDesc, setNewDesc] = useState('');
 const [newOpening, setNewOpening] = useState('09:00');
 const [newClosing, setNewClosing] = useState('23:00');
 const [newAddr1, setNewAddr1] = useState('');
 const [newCity, setNewCity] = useState('Pune');
 const [newLat, setNewLat] = useState('18.52');
 const [newLng, setNewLng] = useState('73.85');
 const [showLocationPicker, setShowLocationPicker] = useState(false);
 const [adding, setAdding] = useState(false);
 const [newLogoUrl, setNewLogoUrl] = useState<string | null>(null);

 // Edit restaurant state — editTarget is the restaurant being edited; editLoading gates the form while fetching
 const [editTarget, setEditTarget] = useState<RestaurantListItem | null>(null);
 const [editLoading, setEditLoading] = useState(false);
 const [editSaving, setEditSaving] = useState(false);
 const [editName, setEditName] = useState('');
 const [editCuisine, setEditCuisine] = useState('');
 const [editPhone, setEditPhone] = useState('');
 const [editEmail, setEditEmail] = useState('');
 const [editDesc, setEditDesc] = useState('');
 const [editOpening, setEditOpening] = useState('09:00');
 const [editClosing, setEditClosing] = useState('23:00');
 const [editAddr1, setEditAddr1] = useState('');
 const [editCity, setEditCity] = useState('Pune');
 const [editLat, setEditLat] = useState('18.52');
 const [editLng, setEditLng] = useState('73.85');
 const [showEditLocationPicker, setShowEditLocationPicker] = useState(false);
 const [editLogoUrl, setEditLogoUrl] = useState<string | null>(null);

 const load = () => {
 setLoading(true);
 const params = new URLSearchParams({ page: '1', pageSize: '50' });
 if (q) params.set('q', q);
 if (statusFilter) params.set('status', statusFilter);
 api.get<{ items: RestaurantListItem[]; total: number }>(`/api/v1/admin/restaurants?${params}`)
 .then((r) => setItems(r.items))
 .catch((e) => toastApiError(e, 'Failed to load restaurants'))
 .finally(() => setLoading(false));
 };

 useEffect(() => { load(); }, [q, statusFilter]);

 const action = async (id: string, kind: 'approve' | 'reject' | 'suspend' | 'activate', reason?: string) => {
 try {
 await api.post(`/api/v1/admin/restaurants/${id}/${kind}`, reason ? { reason } : {});
 toast.success(`Restaurant ${kind}d`);
 load();
 } catch (e) {
 toastApiError(e, `Failed to ${kind}`);
 }
 };

 const createRestaurant = async (e: React.FormEvent) => {
 e.preventDefault();
 setAdding(true);
 try {
 await api.post('/api/v1/admin/restaurants', {
 name: newName,
 cuisine: newCuisine || undefined,
 phone: newPhone || undefined,
 email: newEmail || undefined,
 description: newDesc || undefined,
 openingTime: newOpening,
 closingTime: newClosing,
 logoUrl: newLogoUrl || undefined,
 address: newAddr1 ? { line1: newAddr1, city: newCity, latitude: parseFloat(newLat), longitude: parseFloat(newLng) } : undefined,
 });
 toast.success('Restaurant created');
 setShowAdd(false);
 setNewName(''); setNewCuisine(''); setNewPhone(''); setNewEmail(''); setNewDesc('');
 setNewAddr1('');
 setNewLogoUrl(null);
 load();
 } catch (e) {
 toastApiError(e, 'Failed to create restaurant');
 } finally {
 setAdding(false);
 }
 };

 // ── Edit restaurant: open dialog + fetch full restaurant (with address) + pre-fill the form ──
 const openEdit = async (r: RestaurantListItem) => {
 setEditTarget(r);
 setEditLoading(true);
 // optimistic defaults from the list row so the form is usable even before fetch resolves
 setEditName(r.name);
 setEditCuisine(r.cuisine || '');
 setEditPhone(r.phone || '');
 setEditEmail('');
 setEditDesc('');
 setEditOpening('09:00');
 setEditClosing('23:00');
 setEditAddr1('');
 setEditCity('Pune');
 setEditLat('18.52');
 setEditLng('73.85');
 setEditLogoUrl(null);
 try {
 const full = await api.get<{
 name: string;
 cuisine: string;
 phone: string;
 email: string | null;
 description: string | null;
 openingTime: string;
 closingTime: string;
 latitude: number;
 longitude: number;
 logoUrl: string | null;
 address: { line1: string; line2: string | null; city: string; state: string | null; postalCode: string | null; latitude: number; longitude: number } | null;
 }>(`/api/v1/admin/restaurants/${r.id}`);
 setEditName(full.name || '');
 setEditCuisine(full.cuisine || '');
 setEditPhone(full.phone || '');
 setEditEmail(full.email || '');
 setEditDesc(full.description || '');
 setEditOpening(full.openingTime || '09:00');
 setEditClosing(full.closingTime || '23:00');
 setEditLogoUrl(full.logoUrl || null);
 if (full.address) {
 setEditAddr1(full.address.line1 || '');
 setEditCity(full.address.city || 'Pune');
 setEditLat(String(full.address.latitude ?? 18.52));
 setEditLng(String(full.address.longitude ?? 73.85));
 } else {
 setEditLat(String(full.latitude ?? 18.52));
 setEditLng(String(full.longitude ?? 73.85));
 }
 } catch (e) {
 toastApiError(e, 'Failed to load restaurant details');
 setEditTarget(null);
 } finally {
 setEditLoading(false);
 }
 };

 const saveEdit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!editTarget) return;
 setEditSaving(true);
 try {
 await api.patch(`/api/v1/admin/restaurants/${editTarget.id}`, {
 name: editName,
 cuisine: editCuisine || undefined,
 phone: editPhone || undefined,
 email: editEmail || undefined,
 description: editDesc || undefined,
 openingTime: editOpening,
 closingTime: editClosing,
 logoUrl: editLogoUrl || null,
 address: editAddr1 ? {
 line1: editAddr1,
 city: editCity,
 latitude: parseFloat(editLat),
 longitude: parseFloat(editLng),
 } : undefined,
 });
 toast.success('Restaurant updated');
 setEditTarget(null);
 load();
 } catch (e) {
 toastApiError(e, 'Failed to update restaurant');
 } finally {
 setEditSaving(false);
 }
 };

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <PageHeader title="Restaurant Management" subtitle="Add restaurants, manage their menus, approve, suspend, or activate" />
 <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setShowAdd(true)}>
 <Plus className="w-4 h-4 mr-1" /> Add Restaurant
 </Button>
 </div>
 <div className="flex gap-2 flex-wrap">
 <Input placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
 <select className="border rounded px-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
 <option value="">All statuses</option>
 <option value="PENDING_APPROVAL">Pending</option>
 <option value="ACTIVE">Active</option>
 <option value="SUSPENDED">Suspended</option>
 <option value="REJECTED">Rejected</option>
 <option value="INACTIVE">Inactive</option>
 </select>
 </div>

 {loading ? (
 <div className="text-sm text-slate-500">Loading…</div>
 ) : items.length === 0 ? (
 <EmptyState title="No restaurants found" message="Try a different search or filter." />
 ) : (
 <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Name</TableHead>
 <TableHead>Cuisine</TableHead>
 <TableHead>Status</TableHead>
 <TableHead>Availability</TableHead>
 <TableHead>Phone</TableHead>
 <TableHead className="text-right">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {items.map((r) => (
 <TableRow key={r.id}>
 <TableCell className="font-medium text-slate-800">{r.name}</TableCell>
 <TableCell>{r.cuisine}</TableCell>
 <TableCell><StatusBadge status={r.status} /></TableCell>
 <TableCell><AvailabilityBadge status={r.availability} /></TableCell>
 <TableCell className="text-xs">{r.phone || '—'}</TableCell>
 <TableCell className="text-right space-x-1">
 <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
 <Pencil className="w-3 h-3 mr-1" /> Edit
 </Button>
 <Button size="sm" variant="outline" onClick={() => onOpenMenu(r)}>
 <UtensilsCrossed className="w-3 h-3 mr-1" /> Menu
 </Button>
 {r.status === 'PENDING_APPROVAL' && (
 <>
 <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700" onClick={() => action(r.id, 'approve')}>
 <CheckCircle className="w-4 h-4 mr-1" /> Approve
 </Button>
 <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setRejectTarget(r)}>
 <XCircle className="w-4 h-4 mr-1" /> Reject
 </Button>
 </>
 )}
 {r.status === 'ACTIVE' && (
 <Button size="sm" variant="ghost" className="text-amber-600 hover:text-amber-700" onClick={() => action(r.id, 'suspend')}>
 <Pause className="w-4 h-4 mr-1" /> Suspend
 </Button>
 )}
 {(r.status === 'SUSPENDED' || r.status === 'INACTIVE') && (
 <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700" onClick={() => action(r.id, 'activate')}>
 <Play className="w-4 h-4 mr-1" /> Activate
 </Button>
 )}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}

 {/* Add Restaurant Dialog */}
 <Dialog open={showAdd} onOpenChange={setShowAdd}>
 <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle>Add New Restaurant</DialogTitle>
 </DialogHeader>
 <form onSubmit={createRestaurant} className="space-y-3">
 <LogoUploader value={newLogoUrl} onChange={setNewLogoUrl} fallbackLetter={newName || 'R'} />
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="r-name">Name *</Label>
 <Input id="r-name" placeholder="e.g. Pizza Palace" value={newName} onChange={(e) => setNewName(e.target.value)} required />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="r-cuisine">Cuisine</Label>
 <Input id="r-cuisine" placeholder="e.g. Italian" value={newCuisine} onChange={(e) => setNewCuisine(e.target.value)} />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="r-phone">Phone</Label>
 <Input id="r-phone" placeholder="+91 98765 43210" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="r-email">Email</Label>
 <Input id="r-email" placeholder="restaurant@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="r-desc">Description</Label>
 <Textarea id="r-desc" placeholder="Brief description of the restaurant" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="r-open">Opening</Label>
 <Input id="r-open" type="time" value={newOpening} onChange={(e) => setNewOpening(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="r-close">Closing</Label>
 <Input id="r-close" type="time" value={newClosing} onChange={(e) => setNewClosing(e.target.value)} />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="r-addr">Address</Label>
 <div className="flex gap-2">
 <Input id="r-addr" placeholder="Will auto-fill from map" value={newAddr1} onChange={(e) => setNewAddr1(e.target.value)} className="flex-1" />
 <Button type="button" size="sm" variant="outline" onClick={() => setShowLocationPicker(true)}>
 <MapPin className="w-3 h-3 mr-1" /> Pick on map
 </Button>
 </div>
 {(parseFloat(newLat) !== 18.52 || parseFloat(newLng) !== 73.85) && (
 <p className="text-xs text-slate-500 mt-1">Selected: {newLat}, {newLng}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="r-city">City</Label>
 <Input id="r-city" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
 </div>
 <DialogFooter>
 <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
 <Button type="submit" disabled={adding || !newName} className="bg-orange-500 hover:bg-orange-600">
 {adding ? 'Creating…' : 'Create restaurant'}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>

 {/* Edit Restaurant Dialog — same fields as Add, pre-filled with the restaurant's current data */}
 <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
 <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle>Edit Restaurant{editTarget ? ` — ${editTarget.name}` : ''}</DialogTitle>
 </DialogHeader>
 {editLoading ? (
 <div className="py-8 text-center text-sm text-slate-500">Loading restaurant details…</div>
 ) : (
 <form onSubmit={saveEdit} className="space-y-3">
 <LogoUploader value={editLogoUrl} onChange={setEditLogoUrl} fallbackLetter={editName || (editTarget?.name ?? 'R')} />
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="e-name">Name *</Label>
 <Input id="e-name" placeholder="e.g. Pizza Palace" value={editName} onChange={(e) => setEditName(e.target.value)} required />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="e-cuisine">Cuisine</Label>
 <Input id="e-cuisine" placeholder="e.g. Italian" value={editCuisine} onChange={(e) => setEditCuisine(e.target.value)} />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="e-phone">Phone</Label>
 <Input id="e-phone" placeholder="+91 98765 43210" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="e-email">Email</Label>
 <Input id="e-email" placeholder="restaurant@example.com" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="e-desc">Description</Label>
 <Textarea id="e-desc" placeholder="Brief description of the restaurant" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="e-open">Opening</Label>
 <Input id="e-open" type="time" value={editOpening} onChange={(e) => setEditOpening(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="e-close">Closing</Label>
 <Input id="e-close" type="time" value={editClosing} onChange={(e) => setEditClosing(e.target.value)} />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="e-addr">Address</Label>
 <div className="flex gap-2">
 <Input id="e-addr" placeholder="Will auto-fill from map" value={editAddr1} onChange={(e) => setEditAddr1(e.target.value)} className="flex-1" />
 <Button type="button" size="sm" variant="outline" onClick={() => setShowEditLocationPicker(true)}>
 <MapPin className="w-3 h-3 mr-1" /> Pick on map
 </Button>
 </div>
 {(parseFloat(editLat) !== 18.52 || parseFloat(editLng) !== 73.85) && (
 <p className="text-xs text-slate-500 mt-1">Selected: {editLat}, {editLng}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="e-city">City</Label>
 <Input id="e-city" value={editCity} onChange={(e) => setEditCity(e.target.value)} />
 </div>
 <DialogFooter>
 <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
 <Button type="submit" disabled={editSaving || !editName} className="bg-orange-500 hover:bg-orange-600">
 {editSaving ? 'Saving…' : 'Save changes'}
 </Button>
 </DialogFooter>
 </form>
 )}
 </DialogContent>
 </Dialog>

 {/* Location Picker Modal (for Add) */}
 <LocationPickerModal
 open={showLocationPicker}
 onOpenChange={setShowLocationPicker}
 currentLat={parseFloat(newLat) || 18.52}
 currentLng={parseFloat(newLng) || 73.85}
 onSelect={(lat, lng, label) => {
 setNewLat(lat.toFixed(6));
 setNewLng(lng.toFixed(6));
 if (label && !newAddr1) setNewAddr1(label);
 toast.success(`Location set: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
 }}
 />

 {/* Location Picker Modal (for Edit) */}
 <LocationPickerModal
 open={showEditLocationPicker}
 onOpenChange={setShowEditLocationPicker}
 currentLat={parseFloat(editLat) || 18.52}
 currentLng={parseFloat(editLng) || 73.85}
 onSelect={(lat, lng, label) => {
 setEditLat(lat.toFixed(6));
 setEditLng(lng.toFixed(6));
 if (label && !editAddr1) setEditAddr1(label);
 toast.success(`Location set: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
 }}
 />

 {/* Reject Dialog */}
 <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>Reject {rejectTarget?.name}</DialogTitle>
 </DialogHeader>
 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label htmlFor="reason">Reason</Label>
 <Textarea id="reason" placeholder="e.g. Incomplete business documents" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
 </div>
 </div>
 <DialogFooter>
 <Button variant="ghost" onClick={() => setRejectTarget(null)}>Cancel</Button>
 <Button variant="destructive" onClick={async () => {
 if (rejectTarget) await action(rejectTarget.id, 'reject', rejectReason || 'Rejected by admin');
 setRejectTarget(null);
 setRejectReason('');
 }}>
 Reject restaurant
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

// Menu Management dialog — admin adds/edits/deletes menu categories + items
function AdminMenuManagement({ restaurant, onClose }: { restaurant: RestaurantListItem; onClose: () => void }) {
 interface MenuCat { id: string; name: string; displayOrder: number; items: MenuItm[] }
 interface MenuItm { id: string; name: string; description: string | null; price: number; isVeg: boolean; availability: string; imageUrl: string | null; displayOrder: number; prepTimeMinutes?: number }
 const [menu, setMenu] = useState<MenuCat[]>([]);
 const [loading, setLoading] = useState(true);
 const [newCatName, setNewCatName] = useState('');
 // Item form now lives in a Dialog (was inline before)
 const [showItemForm, setShowItemForm] = useState(false);
 const [editingItem, setEditingItem] = useState<MenuItm | null>(null);

 // New item form state
 const [itemName, setItemName] = useState('');
 const [itemPrice, setItemPrice] = useState('');
 const [itemDesc, setItemDesc] = useState('');
 const [itemVeg, setItemVeg] = useState(true);
 const [itemCatId, setItemCatId] = useState('');
 const [itemImageUrl, setItemImageUrl] = useState<string | null>(null);

 const load = () => {
 setLoading(true);
 api.get<any>(`/api/v1/restaurants/${restaurant.id}/menu`)
 .then((r) => setMenu(r?.menuCategories || []))
 .catch((e) => toastApiError(e, 'Failed to load menu'))
 .finally(() => setLoading(false));
 };

 useEffect(() => { load(); }, []);

 const addCategory = async () => {
 if (!newCatName.trim()) return;
 try {
 await api.post('/api/v1/menu/categories', { restaurantId: restaurant.id, name: newCatName });
 setNewCatName('');
 toast.success('Category added');
 load();
 } catch (e) { toastApiError(e, 'Failed'); }
 };

 const deleteCategory = async (id: string) => {
 try {
 await api.delete(`/api/v1/menu/categories/${id}`);
 toast.success('Category deleted');
 load();
 } catch (e) { toastApiError(e, 'Failed'); }
 };

 const addItem = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!itemCatId || !itemName || !itemPrice) return;
 try {
 if (editingItem) {
 await api.patch(`/api/v1/menu/items/${editingItem.id}`, {
 name: itemName, price: parseFloat(itemPrice), description: itemDesc || undefined, isVeg: itemVeg, imageUrl: itemImageUrl || null,
 });
 toast.success('Item updated');
 } else {
 await api.post('/api/v1/menu/items', {
 restaurantId: restaurant.id, categoryId: itemCatId,
 name: itemName, price: parseFloat(itemPrice), description: itemDesc || undefined, isVeg: itemVeg, imageUrl: itemImageUrl || undefined,
 });
 toast.success('Item added');
 }
 setItemName(''); setItemPrice(''); setItemDesc(''); setItemVeg(true); setItemCatId(''); setItemImageUrl(null);
 setShowItemForm(false); setEditingItem(null);
 load();
 } catch (e) { toastApiError(e, 'Failed'); }
 };

 const editItem = (item: MenuItm, catId: string) => {
 setEditingItem(item);
 setItemName(item.name);
 setItemPrice(String(item.price));
 setItemDesc(item.description || '');
 setItemVeg(item.isVeg);
 setItemCatId(catId);
 setItemImageUrl(item.imageUrl || null);
 setShowItemForm(true);
 };

 const deleteItem = async (id: string) => {
 try {
 // Backend returns { action: 'deleted' | 'unavailable', message } — if the item has past
 // orders it's soft-removed (marked UNAVAILABLE) instead of hard-deleted to preserve order history.
 const result = await api.delete<{ action: 'deleted' | 'unavailable'; message: string }>(`/api/v1/menu/items/${id}`);
 if (result?.action === 'unavailable') {
 toast.info(result.message || 'Item marked as Unavailable (has past orders).');
 } else {
 toast.success(result?.message || 'Item deleted');
 }
 load();
 } catch (e) { toastApiError(e, 'Failed to delete item'); }
 };

 // Toggle item availability via the dedicated PATCH endpoint
 const toggleAvailability = async (item: MenuItm) => {
 const next = item.availability === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
 try {
 await api.patch(`/api/v1/menu/items/${item.id}/availability`, { availability: next });
 load();
 } catch (e) { toastApiError(e, 'Failed'); }
 };

 const openNewItemForm = (catId: string) => {
 setEditingItem(null);
 setItemName(''); setItemPrice(''); setItemDesc(''); setItemVeg(true); setItemImageUrl(null);
 setItemCatId(catId);
 setShowItemForm(true);
 };

 const totalItems = menu.reduce((sum, c) => sum + c.items.length, 0);

 return (
 <div className="space-y-4">
 {/* ── Context card: breadcrumb + title + description ── */}
 <Card>
 <CardContent className="p-4">
 <button onClick={onClose} className="flex items-center text-slate-500 hover:text-slate-800 text-sm mb-2">
 <ArrowLeft className="w-4 h-4 mr-1" /> Restaurants
 </button>
 <div className="flex items-center gap-2">
 <UtensilsCrossed className="w-5 h-5 text-orange-500" />
 <h1 className="text-xl font-semibold text-slate-800">Menu — {restaurant.name}</h1>
 </div>
 <p className="text-sm text-slate-500 mt-1">Manage categories and items for this restaurant.</p>
 </CardContent>
 </Card>

 {/* ── Categories card: chips + add category ── */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <div>
 <CardTitle className="text-base">Categories</CardTitle>
 <p className="text-xs text-slate-500 mt-0.5">{menu.length} total</p>
 </div>
 <div className="flex gap-2 items-center">
 <Input placeholder="New category name (e.g. Starters)" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="w-56 h-8 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }} />
 <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={addCategory}>
 <Plus className="w-3.5 h-3.5 mr-1" /> Add category
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {loading ? (
 <p className="text-sm text-slate-500">Loading…</p>
 ) : menu.length === 0 ? (
 <p className="text-xs text-slate-400 py-2">No categories yet — add one above.</p>
 ) : (
 <div className="flex flex-wrap gap-2">
 {menu.map((cat) => (
 <div key={cat.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-3 pr-1.5 py-1.5">
 <span className="text-sm font-medium text-slate-700">{cat.name}</span>
 <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{cat.items.length} items</span>
 <button className="text-slate-400 hover:text-red-600 p-0.5" onClick={() => deleteCategory(cat.id)} aria-label={`Delete ${cat.name} category`}>
 <XCircle className="w-3.5 h-3.5" />
 </button>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>

 {/* ── Items card: grouped by category ── */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base">Items</CardTitle>
 <p className="text-xs text-slate-500 mt-0.5">Grouped by category. Toggle availability with the switch.</p>
 </CardHeader>
 <CardContent>
 {loading ? (
 <p className="text-sm text-slate-500">Loading…</p>
 ) : totalItems === 0 && menu.length === 0 ? (
 <EmptyState title="No items yet" message="Add a category above, then add items to it." />
 ) : (
 <div className="space-y-5">
 {menu.map((cat) => (
 <div key={cat.id}>
 {/* Category section header */}
 <div className="flex items-center justify-between mb-2">
 <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cat.name}</h3>
 <Button size="sm" variant="outline" className="h-7" onClick={() => openNewItemForm(cat.id)}>
 <Plus className="w-3 h-3 mr-1" /> Add item
 </Button>
 </div>
 {/* Items list */}
 {cat.items.length === 0 ? (
 <p className="text-xs text-slate-400 py-2 pl-1">No items in this category</p>
 ) : (
 <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
 {cat.items.map((item) => (
 <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-slate-50">
 {/* Veg indicator */}
 <span className={`w-4 h-4 border-2 rounded-sm flex items-center justify-center shrink-0 ${item.availability === 'AVAILABLE' ? (item.isVeg ? 'border-green-500' : 'border-red-500') : 'border-slate-300'}`}>
 <span className={`w-1.5 h-1.5 rounded-full ${item.availability === 'AVAILABLE' ? (item.isVeg ? 'bg-green-500' : 'bg-red-500') : 'bg-slate-300'}`} />
 </span>
 {/* Image thumbnail */}
 {item.imageUrl ? (
 // eslint-disable-next-line @next/next/no-img-element
 <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
 ) : (
 <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-orange-400 text-sm font-semibold shrink-0">
 {item.name.charAt(0)}
 </div>
 )}
 {/* Name + description */}
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
 <p className="text-xs text-slate-500 truncate">{item.description || '—'}{item.prepTimeMinutes ? ` · ${item.prepTimeMinutes} min` : ''}</p>
 </div>
 {/* Price */}
 <p className="text-sm font-semibold text-slate-800 shrink-0">₹{item.price}</p>
 {/* Status badge */}
 <Badge variant="secondary" className={`text-[10px] shrink-0 ${item.availability === 'AVAILABLE' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
 {item.availability === 'AVAILABLE' ? 'Available' : 'Unavailable'}
 </Badge>
 {/* Availability toggle */}
 <Switch checked={item.availability === 'AVAILABLE'} onCheckedChange={() => toggleAvailability(item)} />
 {/* Edit pencil */}
 <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700" onClick={() => editItem(item, cat.id)} aria-label="Edit item">
 <Pencil className="w-3.5 h-3.5" />
 </Button>
 {/* Delete */}
 <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => deleteItem(item.id)} aria-label="Delete item">
 <Trash2 className="w-3.5 h-3.5" />
 </Button>
 </div>
 ))}
 </div>
 )}
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>

 {/* ── Item form Dialog (moved from inline) ── */}
 <Dialog open={showItemForm} onOpenChange={(o) => { setShowItemForm(o); if (!o) setEditingItem(null); }}>
 <DialogContent className="max-w-lg">
 <DialogHeader>
 <DialogTitle>{editingItem ? 'Edit item' : 'New item'}</DialogTitle>
 </DialogHeader>
 <form onSubmit={addItem} className="space-y-3">
 <LogoUploader value={itemImageUrl} onChange={setItemImageUrl} fallbackLetter={itemName || 'M'} size={64} label="Item photo" hint="Optional. Shown to customers next to the item name. PNG / JPG / WebP, under 4 MB." />
 <div className="grid grid-cols-3 gap-2">
 <Input placeholder="Item name" value={itemName} onChange={(e) => setItemName(e.target.value)} required className="col-span-2" />
 <Input placeholder="Price ₹" type="number" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} required />
 </div>
 <Input placeholder="Description (optional)" value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} />
 <div className="flex items-center gap-3">
 <label className="flex items-center gap-1 text-xs">
 <input type="checkbox" checked={itemVeg} onChange={(e) => setItemVeg(e.target.checked)} /> Veg
 </label>
 <div className="ml-auto flex gap-2">
 <Button type="button" size="sm" variant="ghost" onClick={() => { setShowItemForm(false); setEditingItem(null); }}>Cancel</Button>
 <Button type="submit" size="sm" className="bg-orange-500 hover:bg-orange-600">{editingItem ? 'Save' : 'Add item'}</Button>
 </div>
 </div>
 </form>
 </DialogContent>
 </Dialog>
 </div>
 );
}

function AdminCustomers() {
 const [items, setItems] = useState<CustomerListItem[]>([]);
 const [total, setTotal] = useState(0);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [q, setQ] = useState('');
 const [page, setPage] = useState(1);
 const PAGE_SIZE = 20;

 // When searching, fetch all matches (no pagination) so the admin can find any customer.
 // When not searching, paginate at 20/page to avoid overloading the query.
 const load = (silent = false) => {
 if (silent) setRefreshing(true); else setLoading(true);
 const searching = q.trim().length > 0;
 const params = new URLSearchParams(
 searching
 ? { page: '1', pageSize: '500', q } // search mode: fetch all matches (500 is the backend max)
 : { page: String(page), pageSize: String(PAGE_SIZE) }, // browse mode: 20/page
 );
 api.get<{ items: CustomerListItem[]; total: number }>(`/api/v1/admin/customers?${params}`)
 .then((r) => { setItems(r.items); setTotal(r.total); })
 .catch((e) => toastApiError(e, 'Failed to load customers'))
 .finally(() => { setLoading(false); setRefreshing(false); });
 };

 useEffect(() => { load(false); }, [q, page]);

 const toggle = async (id: string, isActive: boolean) => {
 try {
 await api.post(`/api/v1/admin/customers/${id}/${isActive ? 'block' : 'unblock'}`, {});
 toast.success(isActive ? 'Customer blocked' : 'Customer unblocked');
 load(true); // silent reload — keeps the table visible
 } catch (e) {
 toastApiError(e, 'Action failed');
 }
 };

 const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
 const searching = q.trim().length > 0;

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between gap-3 flex-wrap">
 <PageHeader title="Customer Management" subtitle={searching ? `${total} result${total === 1 ? '' : 's'} for "${q}"` : `${total} customer${total === 1 ? '' : 's'}`} />
 <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
 <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
 </Button>
 </div>
 <Input placeholder="Search by email or name…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="max-w-xs" />
 {loading ? (
 <div className="text-sm text-slate-500">Loading…</div>
 ) : items.length === 0 ? (
 <EmptyState title={searching ? `No customers match "${q}"` : 'No customers found'} />
 ) : (
 <div className={`border border-slate-200 rounded-lg overflow-x-auto bg-white transition-opacity ${refreshing ? 'opacity-60' : ''}`}>
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Name</TableHead>
 <TableHead>Email</TableHead>
 <TableHead>Phone</TableHead>
 <TableHead>Status</TableHead>
 <TableHead>Joined</TableHead>
 <TableHead className="text-right">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {items.map((c) => (
 <TableRow key={c.id}>
 <TableCell className="font-medium text-slate-800">{c.customerProfile?.fullName || '—'}</TableCell>
 <TableCell className="text-xs">{c.email || '—'}</TableCell>
 <TableCell className="text-xs">{c.phone}</TableCell>
 <TableCell>{c.isActive ? <Badge variant="secondary" className="text-green-700 bg-green-50">Active</Badge> : <Badge variant="secondary" className="text-red-700 bg-red-50">Blocked</Badge>}</TableCell>
 <TableCell className="text-xs">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
 <TableCell className="text-right">
 {c.isActive ? (
 <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => toggle(c.id, true)}>
 <Ban className="w-4 h-4 mr-1" /> Block
 </Button>
 ) : (
 <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700" onClick={() => toggle(c.id, false)}>
 <Shield className="w-4 h-4 mr-1" /> Unblock
 </Button>
 )}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}

 {/* Pagination — only in browse mode (not when searching, since search fetches all matches) */}
 {!searching && total > PAGE_SIZE && (
 <div className="flex items-center justify-between">
 <p className="text-xs text-slate-500">
 Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} customers
 </p>
 <div className="flex gap-1">
 <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
 <span className="text-xs text-slate-500 flex items-center px-2">Page {page} / {totalPages}</span>
 <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
 </div>
 </div>
 )}

 {searching && total > 0 && (
 <p className="text-xs text-slate-500 text-center">Showing all {total} matching customers</p>
 )}
 </div>
 );
}

function AdminOrders() {
 const [items, setItems] = useState<OrderListItem[]>([]);
 const [total, setTotal] = useState(0);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [status, setStatus] = useState('');
 const [page, setPage] = useState(1);
 const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
 const [viewing, setViewing] = useState<OrderListItem | null>(null);
 const PAGE_SIZE = 20;

 // `silent` = re-fetch without showing the "Loading…" placeholder (keeps the current table visible).
 // Used after actions (approve/pay/deliver/cancel) and the Refresh button so the table doesn't flash.
 const load = (silent = false) => {
 if (silent) setRefreshing(true); else setLoading(true);
 const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
 if (status) params.set('status', status);
 if (date) params.set('date', date);
 api.get<{ items: OrderListItem[]; total: number }>(`/api/v1/admin/orders?${params}`)
 .then((r) => { setItems(r.items); setTotal(r.total); })
 .catch((e) => toastApiError(e, 'Failed to load orders'))
 .finally(() => { setLoading(false); setRefreshing(false); });
 };

 useEffect(() => { load(false); }, [status, page, date]);

 const advance = async (id: string, kind: 'approve' | 'mark-paid' | 'delivered') => {
 try {
 await api.post(`/api/v1/admin/orders/${id}/${kind}`, {});
 toast.success(`Order ${kind === 'mark-paid' ? 'marked as paid' : kind}`);
 load(true); // silent reload — keeps the table visible
 } catch (e) {
 toastApiError(e, 'Action failed');
 }
 };

 const cancel = async (id: string) => {
 try {
 await api.post(`/api/v1/admin/orders/${id}/cancel`, { reason: 'Cancelled by admin' });
 toast.success('Order cancelled');
 load(true); // silent reload — keeps the table visible
 } catch (e) {
 toastApiError(e, 'Cancel failed');
 }
 };

 const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between gap-3 flex-wrap">
 <PageHeader title="Order Management" subtitle={`${total} order${total === 1 ? '' : 's'}${date ? ` on ${date}` : ''}`} />
 <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
 <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
 </Button>
 </div>

 {/* Toolbar: date picker + status filter */}
 <div className="flex gap-2 items-center flex-wrap">
 <div className="flex items-center gap-1.5">
 <Label htmlFor="order-date" className="text-xs text-slate-500">Date</Label>
 <input
 id="order-date"
 type="date"
 value={date}
 onChange={(e) => { setDate(e.target.value); setPage(1); }}
 className="border rounded px-2 py-1 text-sm"
 />
 </div>
 <select className="border rounded px-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
 <option value="">All statuses</option>
 <option value="PLACED">Placed</option>
 <option value="APPROVED">Approved</option>
 <option value="PAID">Paid</option>
 <option value="DELIVERED">Delivered</option>
 <option value="CANCELLED">Cancelled</option>
 </select>
 {date && (
 <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setDate(''); setPage(1); }}>Clear date</Button>
 )}
 </div>

 {loading ? (
 <div className="text-sm text-slate-500">Loading…</div>
 ) : items.length === 0 ? (
 <EmptyState title="No orders found" message={date ? `No orders on ${date}.` : 'Try a different filter.'} />
 ) : (
 <div className={`border border-slate-200 rounded-lg overflow-x-auto bg-white transition-opacity ${refreshing ? 'opacity-60' : ''}`}>
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Code</TableHead>
 <TableHead>Restaurant</TableHead>
 <TableHead>Customer</TableHead>
 <TableHead>Status</TableHead>
 <TableHead>Total</TableHead>
 <TableHead>Items</TableHead>
 <TableHead className="text-right">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {items.map((o) => (
 <TableRow key={o.id}>
 <TableCell className="font-mono text-xs">{o.shortCode}</TableCell>
 <TableCell>{o.restaurant.name}</TableCell>
 <TableCell>
 <p className="text-sm font-medium text-slate-800">{o.customer.customerProfile?.fullName || '—'}</p>
 <p className="text-xs text-slate-500">{o.customer.phone}</p>
 </TableCell>
 <TableCell><StatusBadge status={o.orderStatus} /></TableCell>
 <TableCell>₹{o.totalAmount.toLocaleString('en-IN')}</TableCell>
 <TableCell className="text-xs">{o.items.length} items</TableCell>
 <TableCell className="text-right">
 <div className="flex items-center justify-end gap-1 flex-wrap">
 <Button size="sm" variant="outline" className="h-7" onClick={() => setViewing(o)}>
 <Eye className="w-3 h-3 mr-1" /> View
 </Button>
 {o.orderStatus === 'PLACED' && (
 <Button size="sm" variant="outline" className="h-7" onClick={() => advance(o.id, 'approve')}>Approve</Button>
 )}
 {o.orderStatus === 'APPROVED' && (
 <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7" onClick={() => advance(o.id, 'mark-paid')}>Mark as paid</Button>
 )}
 {o.orderStatus === 'PAID' && (
 <Button size="sm" variant="outline" className="h-7" onClick={() => advance(o.id, 'delivered')}>Delivered</Button>
 )}
 {['PLACED', 'APPROVED', 'PAID'].includes(o.orderStatus) && (
 <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7" onClick={() => cancel(o.id)}>
 <X className="w-3 h-3 mr-0.5" /> Cancel
 </Button>
 )}
 </div>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}

 {/* Pagination */}
 {total > PAGE_SIZE && (
 <div className="flex items-center justify-between">
 <p className="text-xs text-slate-500">
 Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} orders
 </p>
 <div className="flex gap-1">
 <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
 <span className="text-xs text-slate-500 flex items-center px-2">Page {page} / {totalPages}</span>
 <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
 </div>
 </div>
 )}

 {viewing && <OrderDetailsDialog order={viewing} onClose={() => setViewing(null)} />}
 </div>
 );
}

/**
 * Full order details dialog — fetches the complete order via GET /api/v1/admin/orders/:id
 * and shows: customer (name + phone), restaurant (name + phone + cuisine), the items
 * table (snapshot name + veg + qty + unit price + subtotal), the delivery address,
 * the pricing breakdown (subtotal / delivery fee / total / payment status), and the
 * status timeline. Plus action buttons matching the order's current status.
 */
function OrderDetailsDialog({ order, onClose }: { order: OrderListItem; onClose: () => void }) {
 const [details, setDetails] = useState<FullOrderDetails | null>(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 setLoading(true);
 api.get<FullOrderDetails>(`/api/v1/admin/orders/${order.id}`)
 .then(setDetails)
 .catch((e) => toastApiError(e, 'Failed to load order details'))
 .finally(() => setLoading(false));
 }, [order.id]);

 const advance = async (kind: 'approve' | 'mark-paid' | 'delivered') => {
 try {
 await api.post(`/api/v1/admin/orders/${order.id}/${kind}`, {});
 toast.success(`Order ${kind === 'mark-paid' ? 'marked as paid' : kind}`);
 onClose();
 } catch (e) {
 toastApiError(e, 'Action failed');
 }
 };

 const cancel = async () => {
 try {
 await api.post(`/api/v1/admin/orders/${order.id}/cancel`, { reason: 'Cancelled by admin' });
 toast.success('Order cancelled');
 onClose();
 } catch (e) {
 toastApiError(e, 'Cancel failed');
 }
 };

 return (
 <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
 <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 Order details — <code className="font-mono text-sm">{order.shortCode}</code>
 <StatusBadge status={order.orderStatus} />
 </DialogTitle>
 </DialogHeader>

 {loading ? (
 <div className="py-8 text-center text-sm text-slate-500">Loading order details…</div>
 ) : !details ? (
 <div className="py-8 text-center text-sm text-slate-500">Could not load order details.</div>
 ) : (
 <div className="space-y-4">
 {/* Two-column meta: customer + restaurant */}
 <div className="grid grid-cols-2 gap-3">
 {/* Customer card */}
 <div className="bg-slate-50 rounded-lg p-3 space-y-1">
 <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</p>
 <p className="text-sm font-medium text-slate-800">{details.customer.customerProfile?.fullName || '—'}</p>
 <p className="text-xs text-slate-600">{details.customer.phone}</p>
 {details.customer.email && <p className="text-xs text-slate-500">{details.customer.email}</p>}
 </div>
 {/* Restaurant card */}
 <div className="bg-slate-50 rounded-lg p-3 space-y-1">
 <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Restaurant</p>
 <p className="text-sm font-medium text-slate-800">{details.restaurant.name}</p>
 <p className="text-xs text-slate-600">{details.restaurant.phone || '—'}</p>
 <p className="text-xs text-slate-500">{details.restaurant.cuisine}</p>
 </div>
 </div>

 {/* Delivery address */}
 <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-1">
 <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1"><MapPin className="w-3 h-3" /> Delivery address</p>
 <p className="text-sm text-slate-800">{details.deliveryAddressLine1}</p>
 {details.deliveryAddressLine2 && <p className="text-xs text-slate-600">{details.deliveryAddressLine2}</p>}
 <p className="text-xs text-slate-600">{details.deliveryCity}</p>
 <p className="text-xs text-slate-500">Recipient phone: {details.deliveryPhone}</p>
 </div>

 {/* Items table */}
 <div>
 <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Items ({details.items.length})</p>
 <div className="border border-slate-200 rounded-lg overflow-hidden">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="text-xs">Item</TableHead>
 <TableHead className="text-xs text-right">Qty</TableHead>
 <TableHead className="text-xs text-right">Unit</TableHead>
 <TableHead className="text-xs text-right">Subtotal</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {details.items.map((it) => (
 <TableRow key={it.id}>
 <TableCell className="text-sm font-medium text-slate-800">{it.itemNameSnapshot}</TableCell>
 <TableCell className="text-xs text-right">{it.quantity}</TableCell>
 <TableCell className="text-xs text-right">₹{it.itemPriceSnapshot}</TableCell>
 <TableCell className="text-xs text-right font-medium">₹{it.subtotal}</TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </div>

 {/* Pricing breakdown */}
 <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
 <div className="flex justify-between text-xs"><span className="text-slate-600">Subtotal</span><span className="font-medium">₹{details.subtotal}</span></div>
 <div className="flex justify-between text-xs"><span className="text-slate-600">Delivery fee</span><span className="font-medium">₹{details.deliveryFee}</span></div>
 <div className="flex justify-between text-xs"><span className="text-slate-600">Tax</span><span className="font-medium">₹{details.tax}</span></div>
 {details.discount > 0 && (
 <div className="flex justify-between text-xs"><span className="text-slate-600">Discount</span><span className="font-medium text-green-600">−₹{details.discount}</span></div>
 )}
 <div className="border-t border-slate-200 pt-1.5 flex justify-between text-sm font-semibold"><span>Total</span><span>₹{details.totalAmount}</span></div>
 {details.payment && (
 <div className="flex justify-between text-xs pt-1">
 <span className="text-slate-500">Payment: {details.payment.status}</span>
 <span className="text-slate-500">{details.payment.method}</span>
 </div>
 )}
 </div>

 {/* Status timeline */}
 {details.statusHistory.length > 0 && (
 <div>
 <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Timeline</p>
 <div className="space-y-1.5">
 {details.statusHistory.map((h, i) => (
 <div key={h.id} className="flex items-start gap-2 text-xs">
 <span className="w-2 h-2 rounded-full bg-orange-400 mt-1 shrink-0" />
 <div>
 <p className="text-slate-700 font-medium">{h.toStatus}{h.fromStatus ? ` (from ${h.fromStatus})` : ''}</p>
 <p className="text-slate-400">{new Date(h.createdAt).toLocaleString('en-IN')}{h.note ? ` • ${h.note}` : ''}</p>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Action buttons */}
 {order.orderStatus !== 'DELIVERED' && order.orderStatus !== 'CANCELLED' && (
 <div className="flex gap-2 pt-2 border-t">
 {order.orderStatus === 'PLACED' && (
 <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => advance('approve')}>Approve</Button>
 )}
 {order.orderStatus === 'APPROVED' && (
 <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => advance('mark-paid')}>Mark as paid</Button>
 )}
 {order.orderStatus === 'PAID' && (
 <Button variant="outline" onClick={() => advance('delivered')}>Mark as delivered</Button>
 )}
 <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto" onClick={cancel}>
 <X className="w-4 h-4 mr-1" /> Cancel order
 </Button>
 </div>
 )}
 </div>
 )}
 </DialogContent>
 </Dialog>
 );
}

function AdminPayments() {
 const [items, setItems] = useState<PaymentListItem[]>([]);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 api.get<{ items: PaymentListItem[]; total: number }>('/api/v1/admin/payments?page=1&pageSize=50')
 .then((r) => setItems(r.items))
 .catch((e) => toastApiError(e, 'Failed to load payments'))
 .finally(() => setLoading(false));
 }, []);

 const refund = async (paymentId: string) => {
 try {
 await api.post(`/api/v1/admin/payments/${paymentId}/refund?byOrderId=true`, {});
 toast.success('Refund initiated');
 // Reload
 setLoading(true);
 api.get<{ items: PaymentListItem[]; total: number }>('/api/v1/admin/payments?page=1&pageSize=50')
 .then((r) => setItems(r.items))
 .finally(() => setLoading(false));
 } catch (e) {
 toastApiError(e, 'Refund failed');
 }
 };

 return (
 <div className="space-y-4">
 <PageHeader title="Payments" subtitle="Manual payment records — admin marks each order as paid. Refund button flags the payment for manual money return." />
 {loading ? (
 <div className="text-sm text-slate-500">Loading…</div>
 ) : items.length === 0 ? (
 <EmptyState title="No payments yet" />
 ) : (
 <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Order</TableHead>
 <TableHead>Restaurant</TableHead>
 <TableHead>Amount</TableHead>
 <TableHead>Method</TableHead>
 <TableHead>Status</TableHead>
 <TableHead>Refund</TableHead>
 <TableHead className="text-right">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {items.map((p) => (
 <TableRow key={p.id}>
 <TableCell className="font-mono text-xs">{p.order.shortCode}</TableCell>
 <TableCell>{p.order.restaurant.name}</TableCell>
 <TableCell>₹{p.amount.toLocaleString('en-IN')}</TableCell>
 <TableCell><Badge variant="outline" className="text-[10px]">{p.method || 'MANUAL'}</Badge></TableCell>
 <TableCell><PaymentBadge status={p.status} /></TableCell>
 <TableCell>{p.refundStatus || '—'}</TableCell>
 <TableCell className="text-right">
 {p.status === 'CAPTURED' && !p.refundStatus && (
 <Button size="sm" variant="outline" onClick={() => refund(p.id)}>
 <RotateCcw className="w-3 h-3 mr-1" /> Mark refunded
 </Button>
 )}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </div>
 );
}

function AdminReports() {
 interface ReportOrder {
 id: string;
 shortCode: string;
 restaurant: string;
 customerPhone: string;
 itemsCount: number;
 subtotal: number;
 deliveryFee: number;
 totalAmount: number;
 orderStatus: string;
 paymentStatus: string;
 paymentAmount: number | null;
 createdAt: string;
 }
 interface ReportSummary {
 totalOrders: number;
 totalRevenue: number;
 statusBreakdown: Record<string, number>;
 }
 interface ReportData {
 from: string;
 to: string;
 summary: ReportSummary;
 orders: ReportOrder[];
 }

 const today = new Date().toISOString().slice(0, 10);
 const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

 const [from, setFrom] = useState(thirtyDaysAgo);
 const [to, setTo] = useState(today);
 const [report, setReport] = useState<ReportData | null>(null);
 const [loading, setLoading] = useState(false);

 const load = () => {
 setLoading(true);
 api.get<ReportData>(`/api/v1/admin/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
 .then(setReport)
 .catch((e) => toastApiError(e, 'Failed to load report'))
 .finally(() => setLoading(false));
 };

 const [downloading, setDownloading] = useState(false);

 useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

 const exportCsv = () => {
 const url = `/api/v1/admin/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=csv`;
 // Use relative URL so the request goes through the Next.js proxy (rewrites in next.config.ts).
 // Direct localhost:4000 won't work from the browser in the preview environment.
 const token = typeof window !== 'undefined' ? localStorage.getItem('fd_access_token') : null;
 setDownloading(true);
 fetch(url, {
 headers: token ? { Authorization: `Bearer ${token}` } : {},
 })
 .then((res) => {
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 return res.blob();
 })
 .then((blob) => {
 const downloadUrl = window.URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = downloadUrl;
 a.download = `foodmitra-report-${from}-to-${to}.csv`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 window.URL.revokeObjectURL(downloadUrl);
 toast.success('CSV downloaded');
 })
 .catch((e) => toast.error(`CSV export failed: ${e.message}`))
 .finally(() => setDownloading(false));
 };

 return (
 <div className="space-y-4">
 <PageHeader
 title="Reports"
 subtitle="Pick a date range to see all orders placed, total revenue, and download a CSV export."
 />

 {/* Date range picker */}
 <Card>
 <CardContent className="p-4 flex items-end gap-3 flex-wrap">
 <div className="space-y-1.5">
 <Label htmlFor="from-date">From date</Label>
 <Input id="from-date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[180px]" />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="to-date">To date</Label>
 <Input id="to-date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[180px]" />
 </div>
 <Button onClick={load} disabled={loading || !from || !to} className="bg-orange-500 hover:bg-orange-600">
 {loading ? 'Loading…' : 'Generate report'}
 </Button>
 <Button variant="outline" onClick={exportCsv} disabled={loading || downloading || !report}>
 {downloading ? 'Downloading…' : 'Download CSV'}
 </Button>
 <div className="ml-auto text-xs text-slate-500">
 Range: {from} to {to}
 </div>
 </CardContent>
 </Card>

 {/* Summary stats */}
 {loading ? (
 <div className="text-sm text-slate-500">Loading report…</div>
 ) : report ? (
 <>
 {/* Summary — just the total revenue (sum of PAID + DELIVERED orders in range) */}
 <div className="grid grid-cols-1 gap-3">
 <StatCard label="Total Revenue" value={`₹${report.summary.totalRevenue.toLocaleString('en-IN')}`} sub="sum of all PAID + DELIVERED orders in range" icon={CreditCard} accent="green" />
 </div>

 {/* Status breakdown */}
 <Card>
 <CardHeader><CardTitle className="text-sm">Status Breakdown</CardTitle></CardHeader>
 <CardContent>
 <div className="flex flex-wrap gap-2">
 {Object.entries(report.summary.statusBreakdown).map(([status, count]) => (
 <Badge key={status} variant="secondary" className="text-xs">
 {status.replace(/_/g, ' ')}: {count}
 </Badge>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* Orders table */}
 <Card>
 <CardHeader>
 <CardTitle className="text-sm">Orders ({report.orders.length})</CardTitle>
 </CardHeader>
 <CardContent>
 {report.orders.length === 0 ? (
 <EmptyState title="No orders in this date range" />
 ) : (
 <div className="border border-slate-200 rounded-lg overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Code</TableHead>
 <TableHead>Restaurant</TableHead>
 <TableHead>Customer</TableHead>
 <TableHead>Items</TableHead>
 <TableHead>Subtotal</TableHead>
 <TableHead>Delivery</TableHead>
 <TableHead>Total</TableHead>
 <TableHead>Status</TableHead>
 <TableHead>Payment</TableHead>
 <TableHead>Placed At</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {report.orders.map((o) => (
 <TableRow key={o.id}>
 <TableCell className="font-mono text-xs">{o.shortCode}</TableCell>
 <TableCell className="text-xs">{o.restaurant}</TableCell>
 <TableCell className="text-xs">{o.customerPhone}</TableCell>
 <TableCell className="text-xs">{o.itemsCount}</TableCell>
 <TableCell className="text-xs">₹{o.subtotal}</TableCell>
 <TableCell className="text-xs">₹{o.deliveryFee}</TableCell>
 <TableCell className="text-xs font-semibold">₹{o.totalAmount}</TableCell>
 <TableCell><StatusBadge status={o.orderStatus} /></TableCell>
 <TableCell className="text-xs">{o.paymentStatus}</TableCell>
 <TableCell className="text-xs">{new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>
 </>
 ) : null}
 </div>
 );
}

function AdminPromos() {
 interface PromoBanner {
 id: string;
 imageUrl: string;
 title: string | null;
 displayOrder: number;
 isActive: boolean;
 createdAt: string;
 }
 const [items, setItems] = useState<PromoBanner[]>([]);
 const [loading, setLoading] = useState(true);
 const [showAdd, setShowAdd] = useState(false);
 const [title, setTitle] = useState('');
 const [displayOrder, setDisplayOrder] = useState('0');
 const [previewUrl, setPreviewUrl] = useState<string | null>(null);
 const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
 const [uploading, setUploading] = useState(false);

 const BACKEND_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
 const resolveUrl = (url: string) =>
 url.startsWith('http') ? url : url.startsWith('/uploads/') ? `${BACKEND_BASE}${url}` : url;

 const load = () => {
 setLoading(true);
 api.get<PromoBanner[]>('/api/v1/admin/promo-banners')
 .then(setItems)
 .catch((e) => toastApiError(e, 'Failed to load promo banners'))
 .finally(() => setLoading(false));
 };
 useEffect(() => { load(); }, []);

 const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;
 if (file.size > 3 * 1024 * 1024) {
 toast.error('Image is too large — please pick one under 3 MB');
 return;
 }
 const reader = new FileReader();
 reader.onload = () => {
 const dataUrl = reader.result as string;
 setImageDataUrl(dataUrl);
 setPreviewUrl(dataUrl);
 };
 reader.readAsDataURL(file);
 };

 const create = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!imageDataUrl) {
 toast.error('Please pick an image first');
 return;
 }
 setUploading(true);
 try {
 await api.post('/api/v1/admin/promo-banners', {
 imageDataUrl,
 title: title || null,
 displayOrder: parseInt(displayOrder || '0', 10) || 0,
 isActive: true,
 });
 setTitle(''); setDisplayOrder('0'); setImageDataUrl(null); setPreviewUrl(null);
 setShowAdd(false);
 toast.success('Promo banner uploaded');
 load();
 } catch (e) {
 toastApiError(e, 'Upload failed');
 } finally {
 setUploading(false);
 }
 };

 const toggle = async (b: PromoBanner) => {
 try {
 await api.patch(`/api/v1/admin/promo-banners/${b.id}`, { isActive: !b.isActive });
 toast.success(b.isActive ? 'Banner hidden' : 'Banner shown');
 load();
 } catch (e) { toastApiError(e, 'Failed'); }
 };

 const remove = async (id: string) => {
 try {
 await api.delete(`/api/v1/admin/promo-banners/${id}`);
 toast.success('Banner deleted');
 load();
 } catch (e) { toastApiError(e, 'Failed'); }
 };

 const sorted = [...items].sort((a, b) => a.displayOrder - b.displayOrder);
 const activeCount = items.filter((b) => b.isActive).length;

 return (
 <div className="space-y-4">
 {/* Header row: title + stats on left, New banner button on right */}
 <div className="flex items-start justify-between gap-3 flex-wrap">
 <PageHeader
 title="Promo banners"
 subtitle={`${items.length} banner${items.length === 1 ? '' : 's'} · ${activeCount} active`}
 />
 <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => { setShowAdd(true); setTitle(''); setDisplayOrder('0'); setPreviewUrl(null); setImageDataUrl(null); }}>
 <Plus className="w-4 h-4 mr-1" /> New banner
 </Button>
 </div>

 {loading ? (
 <div className="text-sm text-slate-500">Loading…</div>
 ) : sorted.length === 0 ? (
 <EmptyState title="No promo banners yet" message="Click 'New banner' to upload one." />
 ) : (
 /* 3-column card grid (matches the reference layout) */
 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
 {sorted.map((b) => (
 <Card key={b.id} className="overflow-hidden">
 {/* Preview area with overlaid badges */}
 <div className="relative w-full aspect-[16/5] bg-slate-100">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={resolveUrl(b.imageUrl)} alt={b.title || 'Promo'} className="w-full h-full object-cover" />
 {/* Order badge (top-left) */}
 <span className="absolute top-2 left-2 bg-white/95 backdrop-blur text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm">
 Order #{b.displayOrder}
 </span>
 {/* Active status badge (top-right) */}
 <span className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm ${b.isActive ? 'bg-green-500 text-white' : 'bg-slate-600 text-white'}`}>
 {b.isActive ? 'Active' : 'Hidden'}
 </span>
 </div>
 {/* Title + image url hint */}
 <CardContent className="p-3 space-y-2">
 <p className="text-sm font-semibold text-slate-800 truncate">{b.title || 'Untitled banner'}</p>
 <p className="text-[10px] text-slate-400 truncate">{b.imageUrl}</p>
 {/* Footer: Live toggle (left) + delete (right) */}
 <div className="flex items-center justify-between pt-1 border-t border-slate-100">
 <label className="flex items-center gap-2 cursor-pointer">
 <Switch checked={b.isActive} onCheckedChange={() => toggle(b)} />
 <span className={`text-xs font-medium ${b.isActive ? 'text-orange-600' : 'text-slate-500'}`}>Live</span>
 </label>
 <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0" onClick={() => remove(b.id)} aria-label="Delete banner">
 <Trash2 className="w-4 h-4" />
 </Button>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}

 {/* New banner dialog */}
 <Dialog open={showAdd} onOpenChange={setShowAdd}>
 <DialogContent className="max-w-lg">
 <DialogHeader>
 <DialogTitle>New promo banner</DialogTitle>
 </DialogHeader>
 <form onSubmit={create} className="space-y-3">
 <div className="space-y-1.5">
 <Label htmlFor="promo-file">Banner image <span className="text-slate-400 text-xs">(JPG / PNG, &lt; 3 MB)</span></Label>
 <input
 id="promo-file" type="file" accept="image/jpeg,image/png,image/webp"
 onChange={onFileSelected}
 className="text-sm"
 />
 {previewUrl && (
 <div className="mt-2 relative w-full aspect-[16/5] rounded-lg overflow-hidden bg-slate-100">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
 </div>
 )}
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="promo-title">Title <span className="text-slate-400 text-xs">(optional)</span></Label>
 <Input id="promo-title" placeholder="e.g. 50% off pizzas" value={title} onChange={(e) => setTitle(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="promo-order">Display order <span className="text-slate-400 text-xs">(lower = first)</span></Label>
 <Input id="promo-order" type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} />
 </div>
 </div>
 <DialogFooter>
 <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
 <Button type="submit" disabled={uploading || !imageDataUrl} className="bg-orange-500 hover:bg-orange-600">
 {uploading ? 'Uploading…' : 'Upload banner'}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 </div>
 );
}

function AdminBirthdays() {
 interface BirthdayItem { id: string; fullName: string; phone: string; dateOfBirth: string; age: number | null; userId: string; }
 interface AnniversaryItem { id: string; fullName: string; phone: string; anniversaryDate: string; yearsMarried: number | null; userId: string; }

 const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
 const [birthdays, setBirthdays] = useState<BirthdayItem[]>([]);
 const [anniversaries, setAnniversaries] = useState<AnniversaryItem[]>([]);
 const [loading, setLoading] = useState(true);

 const load = () => {
 setLoading(true);
 api.get<{ date: string; birthdays: BirthdayItem[]; anniversaries: AnniversaryItem[] }>(
 `/api/v1/admin/birthdays?date=${encodeURIComponent(date)}`,
 )
 .then((r) => { setBirthdays(r.birthdays || []); setAnniversaries(r.anniversaries || []); })
 .catch((e) => toastApiError(e, 'Failed to load birthdays'))
 .finally(() => setLoading(false));
 };

 useEffect(() => { load(); }, [date]);

 const todayStr = new Date().toISOString().slice(0, 10);
 const isToday = date === todayStr;

 return (
 <div className="space-y-4">
 <PageHeader
 title={isToday ? "Today's Birthdays & Anniversaries" : 'Birthdays & Anniversaries'}
 subtitle="Pick any date to see customers celebrating on that day."
 />
 <Card>
 <CardContent className="p-4 flex items-end gap-3 flex-wrap">
 <div className="space-y-1.5">
 <Label htmlFor="bd-date">Date</Label>
 <Input id="bd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[180px]" />
 </div>
 <Button variant="outline" onClick={() => setDate(todayStr)}>Jump to today</Button>
 <div className="text-sm text-slate-500 ml-auto">
 {birthdays.length + anniversaries.length} celebration{birthdays.length + anniversaries.length === 1 ? '' : 's'} on {date}
 </div>
 </CardContent>
 </Card>

 {/* Birthdays — compact: when empty, just a one-line message in the header (no CardContent body at all) */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="flex items-center gap-2 text-base"><Cake className="w-4 h-4 text-pink-500" /> Birthdays ({birthdays.length})</CardTitle>
 {loading ? (
 <p className="text-sm text-slate-500">Loading…</p>
 ) : birthdays.length === 0 ? (
 <p className="text-sm text-slate-400">No birthdays on this date.</p>
 ) : null}
 </CardHeader>
 {!loading && birthdays.length > 0 && (
 <CardContent className="pt-0">
 <div className="border border-slate-200 rounded-lg overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Name</TableHead>
 <TableHead>Phone</TableHead>
 <TableHead>Date of birth</TableHead>
 <TableHead>Turning</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {birthdays.map((b) => (
 <TableRow key={b.id}>
 <TableCell className="font-medium">{b.fullName}</TableCell>
 <TableCell className="text-xs">{b.phone}</TableCell>
 <TableCell className="text-xs">{b.dateOfBirth ? new Date(b.dateOfBirth).toLocaleDateString('en-IN') : '—'}</TableCell>
 <TableCell><Badge className="text-pink-700 bg-pink-50">{b.age ?? '—'} years</Badge></TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 )}
 </Card>

 {/* Anniversaries — same compact pattern */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="flex items-center gap-2 text-base"><Heart className="w-4 h-4 text-red-500" /> Anniversaries ({anniversaries.length})</CardTitle>
 {loading ? (
 <p className="text-sm text-slate-500">Loading…</p>
 ) : anniversaries.length === 0 ? (
 <p className="text-sm text-slate-400">No anniversaries on this date.</p>
 ) : null}
 </CardHeader>
 {!loading && anniversaries.length > 0 && (
 <CardContent className="pt-0">
 <div className="border border-slate-200 rounded-lg overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Name</TableHead>
 <TableHead>Phone</TableHead>
 <TableHead>Anniversary</TableHead>
 <TableHead>Celebrating</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {anniversaries.map((a) => (
 <TableRow key={a.id}>
 <TableCell className="font-medium">{a.fullName}</TableCell>
 <TableCell className="text-xs">{a.phone}</TableCell>
 <TableCell className="text-xs">{a.anniversaryDate ? new Date(a.anniversaryDate).toLocaleDateString('en-IN') : '—'}</TableCell>
 <TableCell><Badge className="text-red-700 bg-red-50">{a.yearsMarried ?? '—'} years</Badge></TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 )}
 </Card>
 </div>
 );
}

function AdminDeliveryFees() {
 interface Tier { id: string; minKm: number; maxKm: number; fee: number; isActive: boolean; }
 const [items, setItems] = useState<Tier[]>([]);
 const [loading, setLoading] = useState(true);
 const [minKm, setMinKm] = useState('');
 const [maxKm, setMaxKm] = useState('');
 const [fee, setFee] = useState('');

 const load = () => {
 setLoading(true);
 api.get<Tier[]>('/api/v1/admin/delivery-fee-tiers')
 .then(setItems)
 .catch((e) => toastApiError(e, 'Failed to load tiers'))
 .finally(() => setLoading(false));
 };

 useEffect(() => { load(); }, []);

 const create = async (e: React.FormEvent) => {
 e.preventDefault();
 const body = {
 minKm: parseFloat(minKm),
 maxKm: parseFloat(maxKm),
 fee: parseFloat(fee),
 };
 if (Number.isNaN(body.minKm) || Number.isNaN(body.maxKm) || Number.isNaN(body.fee)) {
 toast.error('Please enter valid numbers');
 return;
 }
 if (body.maxKm <= body.minKm) {
 toast.error('Max km must be greater than min km');
 return;
 }
 try {
 await api.post('/api/v1/admin/delivery-fee-tiers', body);
 setMinKm(''); setMaxKm(''); setFee('');
 toast.success('Tier created');
 load();
 } catch (e) {
 toastApiError(e, 'Failed to create tier');
 }
 };

 const toggle = async (t: Tier) => {
 try {
 await api.patch(`/api/v1/admin/delivery-fee-tiers/${t.id}`, { isActive: !t.isActive });
 toast.success(t.isActive ? 'Tier disabled' : 'Tier enabled');
 load();
 } catch (e) {
 toastApiError(e, 'Failed');
 }
 };

 const remove = async (id: string) => {
 try {
 await api.delete(`/api/v1/admin/delivery-fee-tiers/${id}`);
 toast.success('Tier deleted');
 load();
 } catch (e) {
 toastApiError(e, 'Failed');
 }
 };

 return (
 <div className="space-y-4">
 <PageHeader title="Delivery Fees" subtitle="Distance-based delivery fee tiers. The matching tier is applied at checkout based on the haversine distance between customer address and restaurant." />
 <Card>
 <CardContent className="p-4">
 <form onSubmit={create} className="flex gap-2 items-end flex-wrap">
 <div className="flex-1 min-w-[100px] space-y-1.5">
 <Label htmlFor="tier-min">Min km</Label>
 <Input id="tier-min" type="number" step="0.1" placeholder="0" value={minKm} onChange={(e) => setMinKm(e.target.value)} />
 </div>
 <div className="flex-1 min-w-[100px] space-y-1.5">
 <Label htmlFor="tier-max">Max km</Label>
 <Input id="tier-max" type="number" step="0.1" placeholder="1" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} />
 </div>
 <div className="flex-1 min-w-[100px] space-y-1.5">
 <Label htmlFor="tier-fee">Fee (₹)</Label>
 <Input id="tier-fee" type="number" step="1" placeholder="30" value={fee} onChange={(e) => setFee(e.target.value)} />
 </div>
 <Button type="submit" className="bg-orange-500 hover:bg-orange-600">Add tier</Button>
 </form>
 </CardContent>
 </Card>
 {loading ? (
 <div className="text-sm text-slate-500">Loading…</div>
 ) : items.length === 0 ? (
 <EmptyState title="No delivery fee tiers yet" />
 ) : (
 <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Min km</TableHead>
 <TableHead>Max km</TableHead>
 <TableHead>Fee</TableHead>
 <TableHead>Status</TableHead>
 <TableHead className="text-right">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {items.map((t) => (
 <TableRow key={t.id}>
 <TableCell>{t.minKm}</TableCell>
 <TableCell>{t.maxKm}</TableCell>
 <TableCell className="font-semibold">₹{t.fee}</TableCell>
 <TableCell>
 <Badge className={t.isActive ? 'text-green-700 bg-green-50' : 'text-slate-700 bg-slate-100'}>
 {t.isActive ? 'Active' : 'Disabled'}
 </Badge>
 </TableCell>
 <TableCell className="text-right space-x-1">
 <Button size="sm" variant="outline" onClick={() => toggle(t)}>{t.isActive ? 'Disable' : 'Enable'}</Button>
 <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 h-7 w-7 p-0" onClick={() => remove(t.id)}>
 <XCircle className="w-3.5 h-3.5" />
 </Button>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </div>
 );
}

// Reusable badges
function StatusBadge({ status }: { status: string }) {
 const map: Record<string, string> = {
 PENDING_APPROVAL: 'text-amber-700 bg-amber-50',
 ACTIVE: 'text-green-700 bg-green-50',
 INACTIVE: 'text-slate-700 bg-slate-100',
 SUSPENDED: 'text-red-700 bg-red-50',
 REJECTED: 'text-red-700 bg-red-50',
 PLACED: 'text-slate-700 bg-slate-100',
 APPROVED: 'text-sky-700 bg-sky-50',
 PAID: 'text-green-700 bg-green-50',
 DELIVERED: 'text-green-700 bg-green-50',
 CANCELLED: 'text-slate-700 bg-slate-100',
 };
 return <Badge variant="secondary" className={`text-[10px] ${map[status] || 'text-slate-700 bg-slate-100'}`}>{status.replace(/_/g, ' ')}</Badge>;
}

function AvailabilityBadge({ status }: { status: string }) {
 const map: Record<string, string> = {
 OPEN: 'text-green-700 bg-green-50',
 CLOSED: 'text-slate-700 bg-slate-100',
 TEMPORARILY_UNAVAILABLE: 'text-amber-700 bg-amber-50',
 SUSPENDED: 'text-red-700 bg-red-50',
 };
 return <Badge variant="secondary" className={`text-[10px] ${map[status] || 'text-slate-700 bg-slate-100'}`}>{status.replace(/_/g, ' ')}</Badge>;
}

function PaymentBadge({ status }: { status: string }) {
 const map: Record<string, string> = {
 PENDING: 'text-slate-700 bg-slate-100',
 CAPTURED: 'text-green-700 bg-green-50',
 FAILED: 'text-red-700 bg-red-50',
 REFUND_PENDING: 'text-amber-700 bg-amber-50',
 REFUNDED: 'text-violet-700 bg-violet-50',
 };
 return <Badge variant="secondary" className={`text-[10px] ${map[status] || 'text-slate-700 bg-slate-100'}`}>{status.replace(/_/g, ' ')}</Badge>;
}
