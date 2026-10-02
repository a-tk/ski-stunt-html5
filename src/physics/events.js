/** Events reported by the physics to a figure's monitor (port of GroundContactEvent). */
export const EventType = { Unknown: 0, GroundContact: 1, WaterContact: 2 };

export class GroundContactEvent {
  static Invalid = 0;
  static Unknown = 1;
  static AddContact = 2;
  static RemoveContact = 3;

  constructor() {
    this.type = EventType.GroundContact;
    this.state = GroundContactEvent.Unknown;
    this.linkNum = -1;
    this.pt = null;
    this.cf = [0, 0];
  }
}
