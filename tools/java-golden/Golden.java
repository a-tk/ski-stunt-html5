// Dumps reference trajectories from the Java version for the JavaScript port's golden tests.
// Compiled and run by tools/java-golden/run.sh against the UNMODIFIED Java sources (classes go to a
// scratch directory outside both repositories). Output: JSON on stdout.
import java.awt.Dimension;
import java.awt.Frame;
import java.io.File;
import java.util.HashMap;
import java.util.Map;
import skistunt.physics.Artfig;
import skistunt.sim.World;
import skistunt.terrain.Obstacle;
import skistunt.ui.GlshApplet;

public class Golden {
  static World world;
  static StringBuilder out = new StringBuilder();

  static void run(String cmd) { world.interp(cmd); }

  static String arr(float[] a) {
    StringBuilder s = new StringBuilder("[");
    for (int i = 0; i < a.length; i++) { if (i > 0) s.append(','); s.append(a[i]); }
    return s.append(']').toString();
  }

  /** Runs one scenario: sets it up with commands, then steps and samples. */
  static String only = null;

  static void scenario(String name, String[] setup, float skierVx, int steps, int every) {
    if (only != null && !only.contains(name)) return;
    // terrain + start pose, the same way the game does it
    for (String c : setup) run(c);
    run("< config/reset.cb");
    world.sim_init_state();
    world.sim_init();
    Artfig skier = world.findArtfig("skier");
    if (skierVx != 0) skier.sim_state[1] = skierVx;
    StringBuilder s = new StringBuilder();
    s.append("\"").append(name).append("\": {\"dt\":0.002,\"every\":").append(every).append(",\"skier\":[");
    StringBuilder crates = new StringBuilder();
    boolean first = true;
    for (int i = 0; i <= steps; i++) {
      if (i % every == 0) {
        if (!first) s.append(',');
        first = false;
        s.append(arr(skier.sim_state));
        if (!world.obstacles.isEmpty()) {
          if (crates.length() > 0) crates.append(',');
          crates.append('[');
          boolean f2 = true;
          for (Obstacle ob : world.obstacles) {
            if (ob.dynamic) {
              if (!f2) crates.append(',');
              f2 = false;
              crates.append(arr(ob.fig.sim_state));
            }
          }
          crates.append(']');
        }
      }
      if (i < steps && !world.sim_step(0.002)) { s.append(",\"ABORTED\""); break; }
    }
    s.append("]");
    if (crates.length() > 0) s.append(",\"crates\":[").append(crates).append(']');
    s.append('}');
    if (out.length() > 0) out.append(",\n");
    out.append(s);
  }

  public static void main(String[] args) throws Exception {
    Frame f = new Frame();
    GlshApplet ap = new GlshApplet();
    Map<String, String> p = new HashMap<>();
    p.put("setupFile", "config/ski.setup");
    p.put("margin", "0.05");
    ap.setParams(p);
    ap.setCodeBase(new File(args[0]).toURI().toURL());   // the assets folder (same files the port uses)
    f.add(ap);
    ap.setPreferredSize(new Dimension(1500, 1000));
    f.pack();
    ap.init();
    if (args.length > 2) only = args[2];
    world = ap.world;
    world.stop();

    scenario("rest_flat", new String[] {"terrain terrain/gnd_practice.txt"}, 0, 1500, 25);
    scenario("slide_kicker", new String[] {"terrain terrain/gnd_kicker_jump.txt"}, 8, 1500, 25);
    scenario("crate_rest", new String[] {"terrain terrain/gnd_practice.txt", "object crate 20 0 0 1 dynamic 10"}, 0, 1000, 25);
    scenario("crate_push", new String[] {"terrain terrain/gnd_practice.txt", "object crate 6 0 0 1 dynamic 10"}, 8, 1500, 25);
    scenario("static_crate", new String[] {"terrain terrain/gnd_practice.txt", "object crate 6 0 0 1"}, 6, 1500, 25);
    java.nio.file.Files.write(java.nio.file.Paths.get(args[1]), ("{\n" + out + "\n}\n").getBytes());
    System.exit(0);
  }
}
