import { describe, it, expect, vi, beforeEach } from 'vitest'

const client = vi.hoisted(() => ({ apiClient: vi.fn() }))
vi.mock('../client', () => client)

import {
  listAdminMaterials,
  createAdminMaterial,
  updateAdminMaterial,
  SMETA_KEYS,
  MATERIAL_CATEGORIES,
  MATERIAL_UNITS,
} from '../adminMaterials'
import { LIGHT_TYPES } from '../../lightCatalog'

beforeEach(() => client.apiClient.mockReset().mockResolvedValue({}))

describe('adminMaterials api', () => {
  it('lists with only the given params', async () => {
    await listAdminMaterials({ smeta: true, q: 'gips' })
    expect(client.apiClient).toHaveBeenCalledWith('/admin/materials?smeta=true&q=gips')
  })
  it('drops empty params and keeps smeta=false out', async () => {
    await listAdminMaterials({ category: '', store_id: undefined, q: '', page: 2 })
    expect(client.apiClient).toHaveBeenCalledWith('/admin/materials?page=2')
    await listAdminMaterials({})
    expect(client.apiClient).toHaveBeenLastCalledWith('/admin/materials')
  })
  it('creates with POST and a JSON body', async () => {
    const input = { store_id: 's1', category: 'gips', name_uz: 'Knauf', unit: 'qop', price_uzs: 5000 }
    await createAdminMaterial(input)
    expect(client.apiClient).toHaveBeenCalledWith('/admin/materials', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  })
  it('updates with PATCH and a JSON body', async () => {
    await updateAdminMaterial('m1', { is_active: false })
    expect(client.apiClient).toHaveBeenCalledWith('/admin/materials/m1', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    })
  })
})

describe('constants', () => {
  const key = (id: string) => SMETA_KEYS.find((k) => k.id === id)!
  it('has the pack unit each key needs', () => {
    expect(key('galtel').packUnit).toBe('m')
    expect(key('suvoq').packUnit).toBe('kg')
    expect(key('gipsokarton').packUnit).toBe('m2')
    expect(key('kabel').packUnit).toBeNull()
    expect(key('kabel').unit).toBe('m')
  })
  it('has one light key per light type, sold by dona', () => {
    const lights = SMETA_KEYS.filter((k) => k.id.startsWith('light:'))
    expect(lights.map((k) => k.id).sort()).toEqual(LIGHT_TYPES.map((t) => `light:${t.id}`).sort())
    for (const k of lights) {
      expect(k.unit).toBe('dona')
      expect(k.packUnit).toBeNull()
    }
    expect(key('light:pendant').label).toBe('Chiroq: Osma chiroq')
  })
  it('lists the backend categories and units', () => {
    expect(MATERIAL_CATEGORIES).toHaveLength(12)
    expect(MATERIAL_CATEGORIES[0]).toEqual({ id: 'boyoq', label: "Bo'yoq" })
    expect(MATERIAL_UNITS.map((u) => u.id)).toEqual(['litr', 'rulon', 'm2', 'qop', 'dona', 'm', 'komplekt'])
  })
})
