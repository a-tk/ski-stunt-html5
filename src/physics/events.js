/** Events reported by the physics to a figure's monitor (ports of Event / GroundContactEvent). */
export const EventType = { Unknown: 0, GroundContact: 1, WaterContact: 2 };

export class Event {
  constructor() { this.type = EventType.Unknown; }
  getType() { return this.type; }
}

export class GroundContactEvent extends Event {
  static Invalid = 0;
  static Unknown = 1;
  static AddContact = 2;
  static RemoveContact = 3;

  constructor() {
    super();
    this.type = EventType.GroundContact;
    this.state = GroundContactEvent.Unknown;
    this.linkNum = -1;
    this.pt = null;
    this.cf = [0, 0];
  }
}
