import {fileURLToPath} from 'node:url';
import {TypertRemoteService,Remote} from '@deepseek-ai/dsh-typert-protocol';
import {DesktopPetController} from './desktop-host.cjs';
export const name='dsh-aquarium';
const initializers=[];
class DesktopPetService extends TypertRemoteService {
  constructor(ctx,root){super(ctx,'desktopPet',{namespace:'desktopPet'});this.controller=new DesktopPetController(root);for(const init of initializers)init.call(this);ctx.effect(()=>()=>this.controller.dispose());}
  update(input){return this.controller.update(input);}
  release(input){return this.controller.release(input);}
}
for(const method of ['update','release'])Remote(DesktopPetService.prototype[method],{kind:'method',name:method,static:false,private:false,addInitializer:fn=>initializers.push(fn)});
export function apply(ctx){ctx.plugin(DesktopPetService,fileURLToPath(new URL('../',import.meta.url)));}
