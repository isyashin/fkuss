import {beforeEach,describe,expect,it,vi} from 'vitest';
import {defaultMagnet} from '@/lib/magnet';
const mocks=vi.hoisted(()=>({admin:vi.fn(),settings:vi.fn(),restaurant:vi.fn(),read:vi.fn(),save:vi.fn(),export:vi.fn(),artwork:vi.fn()}));
vi.mock('@/lib/admin-auth',()=>({isAdmin:mocks.admin}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:()=>true}));
vi.mock('@/lib/site',()=>({getSiteSettings:mocks.settings,getSiteRestaurant:mocks.restaurant}));
vi.mock('@/lib/magnet-server',()=>({readMagnet:mocks.read,saveMagnet:mocks.save}));
vi.mock('@/lib/magnet-renderer',async original=>({...await original<typeof import('@/lib/magnet-renderer')>(),exportMagnet:mocks.export,magnetArtwork:mocks.artwork}));
import{POST}from'@/app/api/admin/magnet/route';
const req=(body:unknown,origin='https://tenant.test')=>new Request('https://tenant.test/api/admin/magnet',{method:'POST',headers:{host:'tenant.test',origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
describe('magnet owner endpoint',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.admin.mockResolvedValue(true);mocks.settings.mockResolvedValue({domains:{canonical:'own-restaurant.example.com'}});mocks.restaurant.mockResolvedValue({slug:'own'});mocks.read.mockResolvedValue(defaultMagnet('Ресторан'));mocks.export.mockResolvedValue(Buffer.from([1,2,3]));mocks.artwork.mockResolvedValue({svg:'<svg/>'});});
 it('rejects guests/staff, foreign origins and oversized streamed requests',async()=>{
  mocks.admin.mockResolvedValueOnce(false);expect((await POST(req({action:'png',revision:0}))).status).toBe(403);expect(mocks.admin).toHaveBeenCalledWith('manage');
  expect((await POST(req({action:'png',revision:0},'https://foreign.test'))).status).toBe(403);
  expect((await POST(req({action:'save',padding:'x'.repeat(9000)}))).status).toBe(413);
 });
 it.each(['png','pdf'])('ignores hostile qrUrl and exports only this tenant canonical: %s',async action=>{
  const res=await POST(req({action,revision:0,qrUrl:'https://other-restaurant.example.com/',draft:{qrUrl:'https://evil.test/'}}));
  expect(res.status).toBe(200);expect(mocks.export).toHaveBeenCalledWith(expect.anything(),'https://own-restaurant.example.com/',action);expect(res.headers.get('Cache-Control')).toContain('no-store');
 });
 it('refuses exporting an older preview and invalid drafts',async()=>{
  expect((await POST(req({action:'pdf',revision:9}))).status).toBe(409);expect(mocks.export).not.toHaveBeenCalled();
  expect((await POST(req({action:'save',draft:{}}))).status).toBe(400);
 });
});
