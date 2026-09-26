// Audio turn-taking must not depend on the optional text transcription.
export class TurnController {
  constructor({ delay = 5000, respond, interrupt, changed = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
    Object.assign(this, { delay, respond, interrupt, changed, setTimer, clearTimer });
    this.version=0;this.active=false;this.speaking=false;this.wantsReply=false;this.requested=false;this.ready=false;
  }
  start(){this.active=true;this.publish();}
  invalidate(){this.version++;this.clearTimer(this.timer);this.timer=null;this.ready=false;}
  speechStart(){
    if(!this.active)return;
    this.invalidate();this.speaking=true;this.wantsReply=false;this.requested=false;
    this.interrupt();this.publish();
  }
  speechStop(){
    if(!this.active)return;
    this.speaking=false;this.wantsReply=true;this.invalidate();
    const version=this.version;
    this.timer=this.setTimer(()=>{if(version!==this.version)return;this.ready=true;this.tryReply();},typeof this.delay==='function'?this.delay():this.delay);
    this.publish();
  }
  tryReply(){
    if(!this.active||this.speaking||!this.ready||!this.wantsReply||this.requested)return;
    // A previous response may still be cancelling. Keep the turn until accepted.
    if(this.respond()===false){
      const version=this.version;
      this.timer=this.setTimer(()=>{if(version===this.version)this.tryReply();},250);
      return;
    }
    this.wantsReply=false;this.requested=true;this.ready=false;this.publish();
  }
  responseDone(){this.requested=false;this.tryReply();this.publish();}
  stop(){this.active=false;this.invalidate();this.publish();}
  publish(){this.changed({active:this.active,speaking:this.speaking,thinking:this.wantsReply,requested:this.requested});}
}
